require('dotenv').config();
const {
  Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, ChannelType, PermissionsBitField, SlashCommandBuilder,
  REST, Routes, AuditLogEvent, Partials
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

console.log('[NRT] Starting...');

// ---------- Express (for Railway) ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('NRT OMEGA ONLINE'));
app.listen(PORT, () => console.log(`[NRT] Web server on port ${PORT}`));

// ---------- Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildBans
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// ---------- Simple DB ----------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const configFile = path.join(dataDir, 'config.json');
const whitelistFile = path.join(dataDir, 'whitelist.json');
const statsFile = path.join(dataDir, 'stats.json');
const trustFile = path.join(dataDir, 'trust.json');
const strikesFile = path.join(dataDir, 'strikes.json');
const logsFile = path.join(dataDir, 'logs.json');

const load = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

if (!fs.existsSync(configFile)) save(configFile, {});
if (!fs.existsSync(whitelistFile)) save(whitelistFile, { users: [] });
if (!fs.existsSync(statsFile)) save(statsFile, { totalBans:0, totalKicks:0, totalTimeouts:0, totalWarnings:0, totalTokensDetected:0, totalRaidsStopped:0 });
if (!fs.existsSync(trustFile)) save(trustFile, {});
if (!fs.existsSync(strikesFile)) save(strikesFile, {});
if (!fs.existsSync(logsFile)) save(logsFile, {});

// ---------- Config ----------
function getConfig(guildId) {
  const all = load(configFile);
  if (!all[guildId]) {
    all[guildId] = {
      logChannel: null,
      antinuke: true, antiraid: true, antispam: true, antibot: true, antitoken: true,
      raidThreshold:5, raidWindow:10000, spamThreshold:3, spamWindow:3000,
      maxStrikes:8, banThreshold:5, kickThreshold:3, timeoutThreshold:2,
      minAccountAge:3, autoLockdown:true, lockdownDuration:300000,
      autoBan:true, autoKick:true, autoTimeout:true, panicMode:false,
      ticketCategoryId:null, ticketImageUrl:null, ticketTypes:['Support','Report','Other'],
      staffRoleId:null,
      verifyChannelId:null, verifyLogChannelId:null, verifyRoleId:null,
      verifyRules: "Read the server rules first.\nDon't cause drama or start fights.\nNo spamming or annoying people.\nDon't send suspicious links or scams.\nDon't pretend to be someone else.\nNo advertising unless it's allowed.\nRespect the staff and other members.\nFollow Discord's rules.\nDon't try to bypass the verification system.\n\nBy verifying, you agree to follow the rules. If you break them, you may be warned, kicked, or banned.",
      welcomeChannelId:null, welcomeMessage:'Welcome {user} to {guild}!', welcomeImageUrl:null,
      proofChannelId:null
    };
    save(configFile, all);
  }
  return all[guildId];
}
function saveConfig(guildId, cfg) {
  const all = load(configFile);
  all[guildId] = cfg;
  save(configFile, all);
}

// ---------- Helpers ----------
const isOwner = (id) => id === process.env.OWNER_ID;
const isWhitelisted = (guildId, userId) => (load(whitelistFile).users || []).includes(userId);
const isBypassed = (guildId, userId) => isOwner(userId) || isWhitelisted(guildId, userId);

function getTrust(guildId, userId) {
  const data = load(trustFile);
  return data[`${guildId}:${userId}`] || 50;
}
function updateTrust(guildId, userId, delta) {
  const data = load(trustFile);
  const key = `${guildId}:${userId}`;
  data[key] = Math.max(0, Math.min(100, (data[key]||50) + delta));
  save(trustFile, data);
}
function getStrikes(guildId, userId) {
  const data = load(strikesFile);
  return data[`${guildId}:${userId}`] || 0;
}
function addStrike(guildId, userId, amount) {
  const data = load(strikesFile);
  const key = `${guildId}:${userId}`;
  data[key] = (data[key]||0) + amount;
  save(strikesFile, data);
  return data[key];
}
function resetStrikes(guildId, userId) {
  const data = load(strikesFile);
  delete data[`${guildId}:${userId}`];
  save(strikesFile, data);
}

const spamTracker = new Map();
function isSpamming(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const times = (spamTracker.get(key)||[]).filter(t => now - t < 3000);
  times.push(now);
  spamTracker.set(key, times);
  return times.length >= 3;
}

const actionTracker = new Map();
function trackAction(userId, actionType, guildId) {
  const key = `${guildId}:${userId}:${actionType}`;
  const now = Date.now();
  const times = (actionTracker.get(key)||[]).filter(t => now - t < 30000);
  times.push(now);
  actionTracker.set(key, times);
  return times.length;
}

async function getAuditExecutor(guild, actionType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ limit:5, type:actionType });
    const entry = targetId ? logs.entries.find(e => e.target?.id === targetId) : logs.entries.first();
    return entry?.executor || null;
  } catch { return null; }
}

async function sendLog(guild, title, desc, fields=[], color=0x00ff88, critical=false) {
  const cfg = getConfig(guild.id);
  if (!cfg.logChannel) return;
  const channel = guild.channels.cache.get(cfg.logChannel);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(`[${critical?'CRITICAL':'SECURITY'}] ${title}`)
    .setDescription(desc)
    .setColor(color)
    .setTimestamp()
    .setFooter({text:'NRT OMEGA'});
  if (fields.length) embed.addFields(fields);
  await channel.send({embeds:[embed]}).catch(()=>{});
}

async function smartPunish(guild, userId, severity, reason, instant=false) {
  if (isBypassed(guild.id, userId)) return 'bypassed';
  const member = await guild.members.fetch(userId).catch(()=>null);
  if (!member) return 'not_found';
  const cfg = getConfig(guild.id);
  const strikes = addStrike(guild.id, userId, severity);
  updateTrust(guild.id, userId, -severity*5);
  let action = 0;
  if (instant) action=3;
  else if (strikes >= cfg.maxStrikes) action=3;
  else if (strikes >= cfg.banThreshold && cfg.autoBan) action=3;
  else if (strikes >= cfg.kickThreshold && cfg.autoKick) action=2;
  else if (strikes >= cfg.timeoutThreshold && cfg.autoTimeout) action=1;
  let result='warning';
  try {
    if (action===3 && member.bannable) {
      await member.ban({reason:`NRT: ${reason}`});
      result='banned';
      const stats=load(statsFile);
      stats.totalBans=(stats.totalBans||0)+1;
      save(statsFile, stats);
      await sendLog(guild,'USER_BANNED',`Banned: ${reason}`, [{name:'User',value:`<@${userId}>`,inline:true},{name:'Strikes',value:`${strikes}`,inline:true}],0xff0000,true);
    } else if (action===2 && member.kickable) {
      await member.kick(`NRT: ${reason}`);
      result='kicked';
      const stats=load(statsFile);
      stats.totalKicks=(stats.totalKicks||0)+1;
      save(statsFile, stats);
      await sendLog(guild,'USER_KICKED',`Kicked: ${reason}`, [{name:'User',value:`<@${userId}>`,inline:true}],0xff6600,true);
    } else if (action===1 && member.moderatable) {
      await member.timeout(300000, `NRT: ${reason}`);
      result='timeout';
      const stats=load(statsFile);
      stats.totalTimeouts=(stats.totalTimeouts||0)+1;
      save(statsFile, stats);
      // FIXED: proper object syntax (value key added)
      await sendLog(guild,'USER_TIMEOUT',`Timed out: ${reason}`, [{name:'User',value:`<@${userId}>`,inline:true},{name:'Duration',value:'5 minutes'}],0xffaa00,true);
    } else {
      await sendLog(guild,'USER_WARNED',`Warned: ${reason}`, [{name:'User',value:`<@${userId}>`,inline:true},{name:'Strikes',value:`${strikes}/${cfg.maxStrikes}`,inline:true}],0xffff00);
    }
  } catch(e){ console.error('[PUNISH]', e.message); result='failed'; }
  return result;
}

// ---------- READY ----------
client.once(Events.ClientReady, async () => {
  console.log(`[NRT] Logged in as ${client.user.tag}`);
  console.log(`[NRT] Servers: ${client.guilds.cache.size}`);

  // Build commands
  const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
    new SlashCommandBuilder().setName('status').setDescription('System status'),
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Ticket system')
      .addSubcommand(sub => sub.setName('panel').setDescription('Send ticket panel'))
      .addSubcommand(sub => sub.setName('category').setDescription('Set category').addChannelOption(opt => opt.setName('category').setDescription('Category').setRequired(true)))
      .addSubcommand(sub => sub.setName('image').setDescription('Set image').addStringOption(opt => opt.setName('url').setDescription('URL').setRequired(true)))
      .addSubcommand(sub => sub.setName('addtype').setDescription('Add type').addStringOption(opt => opt.setName('label').setDescription('Label').setRequired(true)))
      .addSubcommand(sub => sub.setName('removetype').setDescription('Remove type').addStringOption(opt => opt.setName('label').setDescription('Label').setRequired(true))),
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verification system')
      .addSubcommand(sub => sub.setName('setup').setDescription('Send verify button'))
      .addSubcommand(sub => sub.setName('channel').setDescription('Set default channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('log').setDescription('Set log channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('role').setDescription('Set verify role').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)))
      .addSubcommand(sub => sub.setName('rules').setDescription('Set rules text').addStringOption(opt => opt.setName('text').setDescription('Rules').setRequired(true))),
    new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Welcome system')
      .addSubcommand(sub => sub.setName('channel').setDescription('Set welcome channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('message').setDescription('Set message (use {user}, {guild})').addStringOption(opt => opt.setName('text').setDescription('Message').setRequired(true)))
      .addSubcommand(sub => sub.setName('image').setDescription('Set image').addStringOption(opt => opt.setName('url').setDescription('URL').setRequired(true))),
    new SlashCommandBuilder().setName('proof').setDescription('Submit purchase proof'),
    new SlashCommandBuilder().setName('setproofchannel').setDescription('Set proof channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
    new SlashCommandBuilder().setName('setstaffrole').setDescription('Set staff role').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)),
    new SlashCommandBuilder().setName('panic').setDescription('Toggle PANIC mode'),
    new SlashCommandBuilder().setName('safemode').setDescription('Toggle SAFE mode'),
    new SlashCommandBuilder().setName('lockdown').setDescription('Lock all text channels'),
    new SlashCommandBuilder().setName('unlockdown').setDescription('Unlock all text channels'),
    new SlashCommandBuilder().setName('setlog').setDescription('Set log channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
    new SlashCommandBuilder().setName('antinuke').setDescription('Toggle anti-nuke').addStringOption(opt => opt.setName('state').setDescription('on/off').setRequired(true)),
    new SlashCommandBuilder().setName('antiraid').setDescription('Toggle anti-raid').addStringOption(opt => opt.setName('state').setDescription('on/off').setRequired(true)),
    new SlashCommandBuilder().setName('antispam').setDescription('Toggle anti-spam').addStringOption(opt => opt.setName('state').setDescription('on/off').setRequired(true)),
    new SlashCommandBuilder().setName('antibot').setDescription('Toggle anti-bot').addStringOption(opt => opt.setName('state').setDescription('on/off').setRequired(true)),
    new SlashCommandBuilder().setName('antitoken').setDescription('Toggle token detection').addStringOption(opt => opt.setName('state').setDescription('on/off').setRequired(true)),
    new SlashCommandBuilder()
      .setName('whitelist')
      .setDescription('Manage whitelist')
      .addSubcommand(sub => sub.setName('add').setDescription('Add user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('list').setDescription('List whitelisted')),
    new SlashCommandBuilder().setName('trust').setDescription('Check trust').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder().setName('resetstrikes').setDescription('Reset strikes').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder().setName('stats').setDescription('Show punishment stats'),
    new SlashCommandBuilder().setName('logs').setDescription('Recent logs'),
    new SlashCommandBuilder().setName('backup').setDescription('Create backup')
  ];

  const rest = new REST({version:'10'}).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log('[NRT] Cleared global commands.');
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands.map(c => c.toJSON()) });
      console.log('[NRT] Registered commands for guild.');
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
      console.log('[NRT] Registered commands globally.');
    }
  } catch(e) { console.error('[NRT] Command registration error:', e); }

  client.user.setActivity('NRT OMEGA');
  console.log('[NRT] Ready.');
});

// ---------- INTERACTION HANDLER ----------
client.on(Events.InteractionCreate, async interaction => {
  // ---------- MODALS ----------
  if (interaction.isModalSubmit()) {
    const { customId, fields, guild, member, user } = interaction;
    if (customId === 'verifyModal') {
      const fullName = fields.getTextInputValue('fullName');
      const reason = fields.getTextInputValue('reason');
      const embed = new EmbedBuilder()
        .setTitle('New Verification')
        .setColor(0x00ff00)
        .setDescription(`User: ${user}\nID: ${user.id}`)
        .addFields({ name:'Full Name', value:fullName }, { name:'Reason', value:reason })
        .setTimestamp();
      const cfg = getConfig(guild.id);
      const logCh = guild.channels.cache.get(cfg.verifyLogChannelId);
      if (logCh) await logCh.send({embeds:[embed]});
      if (cfg.verifyRoleId) {
        const role = guild.roles.cache.get(cfg.verifyRoleId);
        if (role) await member.roles.add(role).catch(()=>{});
      }
      await interaction.reply({ content:'You have been verified.', ephemeral:true });
      return;
    }
    if (customId.startsWith('ticketModal_')) {
      const type = customId.replace('ticketModal_', '');
      const reason = fields.getTextInputValue('reason');
      const cfg = getConfig(guild.id);
      const category = guild.channels.cache.get(cfg.ticketCategoryId);
      if (!category) {
        await interaction.reply({ content:'Ticket category not set. Use /ticket category.', ephemeral:true });
        return;
      }
      const count = category.children.cache.filter(c => c.name.startsWith('ticket-')).size + 1;
      const name = `ticket-${type.toLowerCase()}-${count}`;
      const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
      ];
      if (cfg.staffRoleId) {
        overwrites.push({ id: cfg.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
      }
      const channel = await category.children.create({ name, type: ChannelType.GuildText, permissionOverwrites: overwrites });
      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${type}`)
        .setDescription(`Created by ${user}\nReason: ${reason}`)
        .setColor(0x1a1a1a)
        .setFooter({text:'NRT OMEGA'});
      await channel.send({ content: `${user}`, embeds: [embed] });
      await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
      return;
    }
    if (customId === 'proofModal') {
      const product = fields.getTextInputValue('product');
      const price = fields.getTextInputValue('price');
      const method = fields.getTextInputValue('method');
      const transId = fields.getTextInputValue('transId');
      const embed = new EmbedBuilder()
        .setTitle('Purchase Proof')
        .setColor(0x00ff88)
        .addFields(
          { name:'Buyer', value:`${user} (${user.id})` },
          { name:'Product', value:product, inline:true },
          { name:'Price', value:price, inline:true },
          { name:'Payment Method', value:method, inline:true },
          { name:'Transaction ID', value:transId, inline:true }
        )
        .setTimestamp()
        .setFooter({text:'NRT OMEGA'});
      const cfg = getConfig(guild.id);
      const proofCh = guild.channels.cache.get(cfg.proofChannelId);
      if (proofCh) {
        await proofCh.send({embeds:[embed]});
        await proofCh.send(`${user}, please attach your proof image here.`);
        await interaction.reply({ content:'Proof logged. Attach image in proof channel.', ephemeral:true });
      } else {
        await interaction.reply({ content:'Proof channel not set. Use /setproofchannel.', ephemeral:true });
      }
      return;
    }
    return;
  }

  // ---------- BUTTONS ----------
  if (interaction.isButton()) {
    const { customId, guild, user } = interaction;
    if (customId === 'verifyButton') {
      const cfg = getConfig(guild.id);
      const modal = new ModalBuilder()
        .setCustomId('verifyModal')
        .setTitle('Verification')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fullName').setLabel('Full Name').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      await interaction.showModal(modal);
      return;
    }
    if (customId.startsWith('ticket_')) {
      const type = customId.replace('ticket_', '');
      const modal = new ModalBuilder()
        .setCustomId(`ticketModal_${type}`)
        .setTitle(`Create ${type} Ticket`)
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      await interaction.showModal(modal);
      return;
    }
    return;
  }

  // ---------- SLASH COMMANDS ----------
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, member } = interaction;
  const cfg = getConfig(guild.id);

  // ---- Help ----
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('NRT OMEGA COMMANDS')
      .setColor(0x0099ff)
      .setDescription('All slash commands:')
      .addFields(
        { name: 'Ticket', value: '`/ticket panel`, `/ticket category`, `/ticket image`, `/ticket addtype`, `/ticket removetype`' },
        { name: 'Verify', value: '`/verify setup`, `/verify channel`, `/verify log`, `/verify role`, `/verify rules`' },
        { name: 'Welcome', value: '`/welcome channel`, `/welcome message`, `/welcome image`' },
        { name: 'Proof', value: '`/proof`, `/setproofchannel`' },
        { name: 'Staff', value: '`/setstaffrole`' },
        { name: 'Security (Owner)', value: '`/panic`, `/safemode`, `/lockdown`, `/unlockdown`, `/setlog`, `/antinuke`, `/antiraid`, `/antispam`, `/antibot`, `/antitoken`, `/whitelist`, `/trust`, `/resetstrikes`, `/stats`, `/logs`, `/backup`, `/status`' }
      )
      .setFooter({text:'NRT OMEGA'});
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ---- Status ----
  if (commandName === 'status') {
    const stats = load(statsFile);
    const embed = new EmbedBuilder()
      .setTitle('System Status')
      .setColor(0x0099ff)
      .addFields(
        { name:'Anti-Nuke', value:cfg.antinuke?'ON':'OFF', inline:true },
        { name:'Anti-Raid', value:cfg.antiraid?'ON':'OFF', inline:true },
        { name:'Anti-Spam', value:cfg.antispam?'ON':'OFF', inline:true },
        { name:'Anti-Bot', value:cfg.antibot?'ON':'OFF', inline:true },
        { name:'Anti-Token', value:cfg.antitoken?'ON':'OFF', inline:true },
        { name:'Panic', value:cfg.panicMode?'ACTIVE':'OFF', inline:true },
        { name:'Bans', value:`${stats.totalBans||0}`, inline:true },
        { name:'Kicks', value:`${stats.totalKicks||0}`, inline:true },
        { name:'Timeouts', value:`${stats.totalTimeouts||0}`, inline:true }
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ---- Owner-only check ----
  const ownerOnly = ['panic','safemode','lockdown','unlockdown','setlog','antinuke','antiraid','antispam','antibot','antitoken','whitelist','trust','resetstrikes','stats','logs','backup'];
  if (ownerOnly.includes(commandName) && !isOwner(interaction.user.id)) {
    await interaction.reply({ content:'Owner only.', ephemeral:true });
    return;
  }

  // ---- Panic ----
  if (commandName === 'panic') {
    cfg.panicMode = !cfg.panicMode;
    saveConfig(guild.id, cfg);
    await interaction.reply({ content:`Panic ${cfg.panicMode?'ACTIVATED':'DEACTIVATED'}`, ephemeral:true });
    return;
  }
  if (commandName === 'safemode') {
    cfg.safeMode = !cfg.safeMode;
    saveConfig(guild.id, cfg);
    await interaction.reply({ content:`Safe mode ${cfg.safeMode?'ACTIVATED':'DEACTIVATED'}`, ephemeral:true });
    return;
  }
  if (commandName === 'lockdown') {
    guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
      .forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(()=>{}));
    await interaction.reply({ content:'Server locked down.', ephemeral:true });
    return;
  }
  if (commandName === 'unlockdown') {
    guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
      .forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(()=>{}));
    await interaction.reply({ content:'Lockdown lifted.', ephemeral:true });
    return;
  }
  if (commandName === 'setlog') {
    const channel = options.getChannel('channel');
    cfg.logChannel = channel.id;
    saveConfig(guild.id, cfg);
    await interaction.reply({ content:`Log channel set to ${channel}`, ephemeral:true });
    return;
  }

  // ---- Toggles ----
  const toggleMap = { antinuke:'antinuke', antiraid:'antiraid', antispam:'antispam', antibot:'antibot', antitoken:'antitoken' };
  if (toggleMap[commandName]) {
    const state = options.getString('state');
    cfg[toggleMap[commandName]] = state === 'on';
    saveConfig(guild.id, cfg);
    await interaction.reply({ content:`${commandName} ${state==='on'?'ON':'OFF'}`, ephemeral:true });
    return;
  }

  // ---- Whitelist ----
  if (commandName === 'whitelist') {
    const sub = options.getSubcommand();
    const wl = load(whitelistFile);
    if (sub === 'add') {
      const user = options.getUser('user');
      if (!wl.users.includes(user.id)) wl.users.push(user.id);
      save(whitelistFile, wl);
      await interaction.reply({ content:`Added ${user.tag}`, ephemeral:true });
    } else if (sub === 'remove') {
      const user = options.getUser('user');
      wl.users = wl.users.filter(id => id !== user.id);
      save(whitelistFile, wl);
      await interaction.reply({ content:`Removed ${user.tag}`, ephemeral:true });
    } else if (sub === 'list') {
      const list = wl.users.map(id => `<@${id}>`).join('\n') || 'None';
      await interaction.reply({ content:`Whitelisted:\n${list}`, ephemeral:true });
    }
    return;
  }
  if (commandName === 'trust') {
    const user = options.getUser('user');
    const score = getTrust(guild.id, user.id);
    const strikes = getStrikes(guild.id, user.id);
    await interaction.reply({ content:`**${user.tag}**\nTrust: ${score}/100\nStrikes: ${strikes}`, ephemeral:true });
    return;
  }
  if (commandName === 'resetstrikes') {
    const user = options.getUser('user');
    resetStrikes(guild.id, user.id);
    await interaction.reply({ content:`Strikes reset for ${user.tag}`, ephemeral:true });
    return;
  }
  if (commandName === 'stats') {
    const stats = load(statsFile);
    const embed = new EmbedBuilder()
      .setTitle('Punishment Statistics')
      .setColor(0x0099ff)
      .addFields(
        { name:'Bans', value:`${stats.totalBans||0}`, inline:true },
        { name:'Kicks', value:`${stats.totalKicks||0}`, inline:true },
        { name:'Timeouts', value:`${stats.totalTimeouts||0}`, inline:true },
        { name:'Warnings', value:`${stats.totalWarnings||0}`, inline:true },
        { name:'Tokens Detected', value:`${stats.totalTokensDetected||0}`, inline:true },
        { name:'Raids Stopped', value:`${stats.totalRaidsStopped||0}`, inline:true }
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }
  if (commandName === 'logs') {
    const logs = load(logsFile);
    const guildLogs = logs[guild.id] || [];
    const recent = guildLogs.slice(-10).reverse().map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.title}`).join('\n');
    await interaction.reply({ content:`\`\`\`\nRECENT LOGS\n${recent || 'No logs'}\n\`\`\``, ephemeral:true });
    return;
  }
  if (commandName === 'backup') {
    const backup = {
      timestamp: Date.now(),
      guildName: guild.name,
      channels: guild.channels.cache.map(c => ({ name:c.name, type:c.type })),
      roles: guild.roles.cache.map(r => ({ name:r.name, permissions:r.permissions.bitfield }))
    };
    const backupFile = path.join(dataDir, 'backup.json');
    let backupsData = load(backupFile);
    if (!backupsData[guild.id]) backupsData[guild.id] = [];
    backupsData[guild.id].push(backup);
    if (backupsData[guild.id].length > 10) backupsData[guild.id].shift();
    save(backupFile, backupsData);
    await interaction.reply({ content:'Backup created.', ephemeral:true });
    return;
  }

  // ---- Ticket ----
  if (commandName === 'ticket') {
    const sub = options.getSubcommand();
    if (sub === 'panel') {
      if (!cfg.ticketCategoryId) {
        await interaction.reply({ content:'Please set a ticket category using `/ticket category`.', ephemeral:true });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('Create a Ticket')
        .setDescription('Click a button below.')
        .setColor(0x1a1a1a)
        .setFooter({text:'NRT OMEGA'});
      if (cfg.ticketImageUrl) embed.setImage(cfg.ticketImageUrl);
      const row = new ActionRowBuilder();
      (cfg.ticketTypes || ['Support','Report','Other']).forEach(label => {
        row.addComponents(new ButtonBuilder().setCustomId(`ticket_${label}`).setLabel(label).setStyle(ButtonStyle.Primary));
      });
      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content:'Ticket panel sent.', ephemeral:true });
      return;
    }
    if (sub === 'category') {
      const category = options.getChannel('category');
      if (category.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content:'Please select a category.', ephemeral:true });
        return;
      }
      cfg.ticketCategoryId = category.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:`Ticket category set to ${category.name}`, ephemeral:true });
      return;
    }
    if (sub === 'image') {
      const url = options.getString('url');
      cfg.ticketImageUrl = url;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:'Ticket image updated.', ephemeral:true });
      return;
    }
    if (sub === 'addtype') {
      const label = options.getString('label');
      if (!cfg.ticketTypes) cfg.ticketTypes = ['Support','Report','Other'];
      if (cfg.ticketTypes.includes(label)) {
        await interaction.reply({ content:'Type already exists.', ephemeral:true });
      } else {
        cfg.ticketTypes.push(label);
        saveConfig(guild.id, cfg);
        await interaction.reply({ content:`Added type "${label}".`, ephemeral:true });
      }
      return;
    }
    if (sub === 'removetype') {
      const label = options.getString('label');
      if (!cfg.ticketTypes) cfg.ticketTypes = ['Support','Report','Other'];
      cfg.ticketTypes = cfg.ticketTypes.filter(t => t !== label);
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:`Removed type "${label}".`, ephemeral:true });
      return;
    }
  }

  // ---- Verify ----
  if (commandName === 'verify') {
    const sub = options.getSubcommand();
    if (sub === 'setup') {
      const rules = cfg.verifyRules || 'Click verify to proceed.';
      const embed = new EmbedBuilder()
        .setTitle('Verification')
        .setDescription(rules)
        .setColor(0x1a1a1a);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verifyButton').setLabel('I Agree & Verify').setStyle(ButtonStyle.Success)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content:'Verification panel sent.', ephemeral:true });
      return;
    }
    if (sub === 'channel') {
      const channel = options.getChannel('channel');
      cfg.verifyChannelId = channel.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:`Verify channel set to ${channel}`, ephemeral:true });
      return;
    }
    if (sub === 'log') {
      const channel = options.getChannel('channel');
      cfg.verifyLogChannelId = channel.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:`Verify log channel set to ${channel}`, ephemeral:true });
      return;
    }
    if (sub === 'role') {
      const role = options.getRole('role');
      cfg.verifyRoleId = role.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:`Verify role set to ${role.name}`, ephemeral:true });
      return;
    }
    if (sub === 'rules') {
      const text = options.getString('text');
      cfg.verifyRules = text;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:'Rules updated.', ephemeral:true });
      return;
    }
  }

  // ---- Welcome ----
  if (commandName === 'welcome') {
    const sub = options.getSubcommand();
    if (sub === 'channel') {
      const channel = options.getChannel('channel');
      cfg.welcomeChannelId = channel.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:`Welcome channel set to ${channel}`, ephemeral:true });
      return;
    }
    if (sub === 'message') {
      const text = options.getString('text');
      cfg.welcomeMessage = text;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:'Welcome message updated.', ephemeral:true });
      return;
    }
    if (sub === 'image') {
      const url = options.getString('url');
      cfg.welcomeImageUrl = url;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content:'Welcome image updated.', ephemeral:true });
      return;
    }
  }

  // ---- Proof ----
  if (commandName === 'proof') {
    const modal = new ModalBuilder()
      .setCustomId('proofModal')
      .setTitle('Submit Purchase Proof')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('product').setLabel('Product').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Price').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('method').setLabel('Payment Method').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('transId').setLabel('Transaction ID').setStyle(TextInputStyle.Short).setRequired(true))
      );
    await interaction.showModal(modal);
    return;
  }
  if (commandName === 'setproofchannel') {
    const channel = options.getChannel('channel');
    cfg.proofChannelId = channel.id;
    saveConfig(guild.id, cfg);
    await interaction.reply({ content:`Proof channel set to ${channel}`, ephemeral:true });
    return;
  }

  // ---- Set staff role ----
  if (commandName === 'setstaffrole') {
    const role = options.getRole('role');
    cfg.staffRoleId = role.id;
    saveConfig(guild.id, cfg);
    await interaction.reply({ content:`Staff role set to ${role.name}`, ephemeral:true });
    return;
  }

  // fallback
  await interaction.reply({ content:'Command executed (all handled).', ephemeral:true });
});

// ---------- SECURITY EVENTS ----------
// Anti-spam
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  const cfg = getConfig(message.guild.id);
  if (!cfg.antispam || isBypassed(message.guild.id, message.author.id)) return;
  if (isSpamming(message.author.id, message.guild.id)) {
    await smartPunish(message.guild, message.author.id, 2, 'Spamming', false);
    await message.delete().catch(()=>{});
  }
});

// Anti-bot
client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.user.bot) return;
  const cfg = getConfig(member.guild.id);
  if (!cfg.antibot) return;
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.BotAdd);
  if (!executor || isBypassed(member.guild.id, executor.id)) return;
  await smartPunish(member.guild, executor.id, 10, 'Added unauthorized bot', true);
  await member.kick('Unauthorized bot').catch(()=>{});
});

// Anti-raid
const joinTracker = new Map();
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  const cfg = getConfig(member.guild.id);
  if (!cfg.antiraid || cfg.panicMode) return;
  const now = Date.now();
  const list = (joinTracker.get(member.guild.id)||[]).concat(now).filter(t => now - t < cfg.raidWindow);
  joinTracker.set(member.guild.id, list);
  if (list.length >= cfg.raidThreshold) {
    joinTracker.set(member.guild.id, []);
    const stats = load(statsFile);
    stats.totalRaidsStopped = (stats.totalRaidsStopped||0)+1;
    save(statsFile, stats);
    if (cfg.autoLockdown) {
      member.guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
        .forEach(c => c.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(()=>{}));
      await member.guild.edit({ verificationLevel: 4 }).catch(()=>{});
    }
    await sendLog(member.guild, 'RAID DETECTED', `Raid with ${list.length} joins`, [], 0xff0000, true);
    setTimeout(() => {
      member.guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
        .forEach(c => c.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null }).catch(()=>{}));
      member.guild.edit({ verificationLevel: 1 }).catch(()=>{});
    }, cfg.lockdownDuration);
  }
  // Account age
  const age = Date.now() - member.user.createdTimestamp;
  if (age < cfg.minAccountAge * 86400000 && !isBypassed(member.guild.id, member.id)) {
    await smartPunish(member.guild, member.id, 8, 'Underage account', true);
  }
});

// Anti-nuke
client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.antinuke || cfg.panicMode) return;
  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!executor || isBypassed(channel.guild.id, executor.id)) return;
  const count = trackAction(executor.id, 'channelDelete', channel.guild.id);
  if (count >= 3) {
    await smartPunish(channel.guild, executor.id, 10, 'Mass channel deletion', true);
  }
});

// Anti-token
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  const cfg = getConfig(message.guild.id);
  if (!cfg.antitoken) return;
  const content = message.content;
  if (content.match(/[MNO][a-zA-Z\d_-]{23}\.[a-zA-Z\d_-]{6}\.[a-zA-Z\d_-]{27}/) ||
      content.match(/[a-zA-Z\d]{24}\.[a-zA-Z\d]{6}\.[a-zA-Z\d]{27}/) ||
      content.match(/mfa\.[a-zA-Z\d_-]{84}/)) {
    const stats = load(statsFile);
    stats.totalTokensDetected = (stats.totalTokensDetected||0)+1;
    save(statsFile, stats);
    await smartPunish(message.guild, message.author.id, 5, 'Token leak', true);
    await message.delete().catch(()=>{});
  }
});

// ---------- Welcome on join ----------
client.on(Events.GuildMemberAdd, async (member) => {
  const cfg = getConfig(member.guild.id);
  if (!cfg.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(cfg.welcomeChannelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x1a1a1a)
    .setTitle('Welcome')
    .setDescription(cfg.welcomeMessage.replace(/{user}/g, member.toString()).replace(/{guild}/g, member.guild.name))
    .setTimestamp();
  if (cfg.welcomeImageUrl) embed.setImage(cfg.welcomeImageUrl);
  await channel.send({ embeds: [embed] }).catch(()=>{});
});

// ---------- LOGIN ----------
const token = process.env.BOT_TOKEN;
if (!token) { console.error('[NRT] Missing BOT_TOKEN'); process.exit(1); }
client.login(token);
