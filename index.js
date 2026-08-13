require('dotenv').config();
const {
  Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField,
  Events, EmbedBuilder, ChannelType, Partials, ActivityType,
  SlashCommandBuilder, REST, Routes, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ================================
//  NRT OMEGA – CLEAN VERSION
// ================================

console.log('[NRT] STARTING...');

// ---------- EXPRESS ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('NRT OMEGA ONLINE'));
app.get('/health', (req, res) => res.json({ status: 'online' }));
app.listen(PORT, () => console.log(`[NRT] Web server on port ${PORT}`));

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

// ---------- DATABASE ----------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = {
  config: path.join(dataDir, 'config.json'),
  whitelist: path.join(dataDir, 'whitelist.json'),
  blacklist: path.join(dataDir, 'blacklist.json'),
  stats: path.join(dataDir, 'stats.json'),
  backup: path.join(dataDir, 'backup.json'),
  trust: path.join(dataDir, 'trust.json'),
  strikes: path.join(dataDir, 'strikes.json'),
  logs: path.join(dataDir, 'logs.json'),
  raidLogs: path.join(dataDir, 'raidLogs.json')
};

Object.values(db).forEach(file => {
  if (!fs.existsSync(file)) {
    const defaults = {
      'config.json': {},
      'whitelist.json': { users: [] },
      'blacklist.json': { users: [] },
      'stats.json': { totalBans: 0, totalKicks: 0, totalTimeouts: 0, totalWarnings: 0, totalTokensDetected: 0, totalRaidsStopped: 0 },
      'backup.json': {},
      'trust.json': {},
      'strikes.json': {},
      'logs.json': {},
      'raidLogs.json': {}
    };
    fs.writeFileSync(file, JSON.stringify(defaults[path.basename(file)] || {}, null, 2));
  }
});

const load = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
const save = (file, data) => { fs.writeFileSync(file, JSON.stringify(data, null, 2)); };

// ---------- CONFIG ----------
function getConfig(guildId) {
  const config = load(db.config);
  if (!config[guildId]) {
    config[guildId] = {
      logChannel: null,
      antinuke: true,
      antiraid: true,
      antispam: true,
      antibot: true,
      antitoken: true,
      raidThreshold: 5,
      raidWindow: 10000,
      spamThreshold: 3,
      spamWindow: 3000,
      maxStrikes: 8,
      banThreshold: 5,
      kickThreshold: 3,
      timeoutThreshold: 2,
      minAccountAge: 3,
      autoLockdown: true,
      lockdownDuration: 300000,
      autoBan: true,
      autoKick: true,
      autoTimeout: true,
      panicMode: false,
      safeMode: false,
      // Ticket
      ticketChannelId: null,
      ticketCategoryId: null,
      ticketImageUrl: null,
      ticketTypes: ['Support','Report','Other'],
      staffRoleId: null,
      // Verify
      verifyChannelId: null,
      verifyLogChannelId: null,
      verifyRoleId: null,
      verifyRules: "Read the server rules first.\nDon't cause drama or start fights.\nNo spamming or annoying people.\nDon't send suspicious links or scams.\nDon't pretend to be someone else.\nNo advertising unless it's allowed.\nRespect the staff and other members.\nFollow Discord's rules.\nDon't try to bypass the verification system.\n\nBy verifying, you agree to follow the rules. If you break them, you may be warned, kicked, or banned.",
      // Welcome
      welcomeChannelId: null,
      welcomeMessage: 'Welcome {user} to {guild}!',
      welcomeImageUrl: null,
      // Proof
      proofChannelId: null
    };
    save(db.config, config);
  }
  return config[guildId];
}

function saveConfig(guildId, cfg) {
  const config = load(db.config);
  config[guildId] = cfg;
  save(db.config, config);
}

// ---------- HELPER FUNCTIONS ----------
const isOwner = (id) => id === process.env.OWNER_ID;
const isWhitelisted = (guildId, userId) => {
  const wl = load(db.whitelist);
  return wl.users?.includes(userId) || false;
};
const isBypassed = (guildId, userId) => isOwner(userId) || isWhitelisted(guildId, userId);

function getTrust(guildId, userId) {
  const data = load(db.trust);
  return data[`${guildId}:${userId}`] || 50;
}
function updateTrust(guildId, userId, delta, reason = '') {
  const data = load(db.trust);
  const key = `${guildId}:${userId}`;
  const current = data[key] || 50;
  data[key] = Math.max(0, Math.min(100, current + delta));
  save(db.trust, data);
}
function getStrikes(guildId, userId) {
  const data = load(db.strikes);
  return data[`${guildId}:${userId}`] || 0;
}
function addStrike(guildId, userId, amount = 1, reason = '') {
  const data = load(db.strikes);
  const key = `${guildId}:${userId}`;
  data[key] = (data[key] || 0) + amount;
  save(db.strikes, data);
  return data[key];
}
function resetStrikes(guildId, userId) {
  const data = load(db.strikes);
  delete data[`${guildId}:${userId}`];
  save(db.strikes, data);
}

const spamTracker = new Map();
function isSpamming(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const window = 3000;
  const limit = 3;
  const times = (spamTracker.get(key) || []).filter(t => now - t < window);
  times.push(now);
  spamTracker.set(key, times);
  return times.length >= limit;
}

const actionTracker = new Map();
function trackAction(userId, actionType, guildId, window = 30000) {
  const key = `${guildId}:${userId}:${actionType}`;
  const now = Date.now();
  const times = (actionTracker.get(key) || []).filter(t => now - t < window);
  times.push(now);
  actionTracker.set(key, times);
  return times.length;
}

async function getAuditExecutor(guild, actionType, targetId = null) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 5, type: actionType });
    let entry = targetId ? logs.entries.find(e => e.target?.id === targetId) : logs.entries.first();
    return entry?.executor || null;
  } catch { return null; }
}

async function sendLog(guild, title, description, fields = [], color = 0x00ff88, critical = false) {
  const cfg = getConfig(guild.id);
  if (!cfg.logChannel) return;
  const channel = guild.channels.cache.get(cfg.logChannel);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(`[${critical ? 'CRITICAL' : 'SECURITY'}] ${title}`)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' });
  if (fields.length) embed.addFields(fields);
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function smartPunish(guild, userId, severity, reason, instant = false) {
  if (isBypassed(guild.id, userId)) return 'bypassed';
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return 'not_found';

  const cfg = getConfig(guild.id);
  const strikes = addStrike(guild.id, userId, severity, reason);
  updateTrust(guild.id, userId, -severity * 5, reason);

  let action = 0;
  if (instant) action = 3;
  else if (strikes >= cfg.maxStrikes) action = 3;
  else if (strikes >= cfg.banThreshold && cfg.autoBan) action = 3;
  else if (strikes >= cfg.kickThreshold && cfg.autoKick) action = 2;
  else if (strikes >= cfg.timeoutThreshold && cfg.autoTimeout) action = 1;

  let result = 'warning';
  try {
    if (action === 3 && member.bannable) {
      await member.ban({ reason: `NRT: ${reason}` });
      result = 'banned';
      const stats = load(db.stats);
      stats.totalBans = (stats.totalBans || 0) + 1;
      save(db.stats, stats);
      await sendLog(guild, 'USER_BANNED', `User banned: ${reason}`, [
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Strikes', value: `${strikes}`, inline: true }
      ], 0xff0000, true);
    } else if (action === 2 && member.kickable) {
      await member.kick(`NRT: ${reason}`);
      result = 'kicked';
      const stats = load(db.stats);
      stats.totalKicks = (stats.totalKicks || 0) + 1;
      save(db.stats, stats);
      await sendLog(guild, 'USER_KICKED', `User kicked: ${reason}`, [
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Strikes', value: `${strikes}`, inline: true }
      ], 0xff6600, true);
    } else if (action === 1 && member.moderatable) {
      await member.timeout(300000, `NRT: ${reason}`);
      result = 'timeout';
      const stats = load(db.stats);
      stats.totalTimeouts = (stats.totalTimeouts || 0) + 1;
      save(db.stats, stats);
      await sendLog(guild, 'USER_TIMEOUT', `User timed out: ${reason}`, [
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Duration', value: '5 minutes', inline: true }
      ], 0xffaa00, true);
    } else {
      await sendLog(guild, 'USER_WARNED', `User warned: ${reason}`, [
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Strikes', value: `${strikes}/${cfg.maxStrikes}`, inline: true }
      ], 0xffff00);
    }
  } catch (err) {
    console.error('[PUNISH] Error:', err.message);
    result = 'failed';
  }
  return result;
}

// ---------- READY ----------
client.once(Events.ClientReady, async () => {
  console.log(`[NRT] Logged in as ${client.user.tag}`);
  console.log(`[NRT] Servers: ${client.guilds.cache.size}`);

  // Register slash commands
  const commands = [
    // General
    new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
    new SlashCommandBuilder().setName('status').setDescription('Show system status'),

    // Ticket group
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Ticket system')
      .addSubcommand(sub => sub.setName('panel').setDescription('Send ticket panel to current channel'))
      .addSubcommand(sub => sub.setName('channel').setDescription('Set default channel for panel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('image').setDescription('Set image for ticket panel').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)))
      .addSubcommand(sub => sub.setName('addtype').setDescription('Add ticket type').addStringOption(opt => opt.setName('label').setDescription('Type label').setRequired(true)))
      .addSubcommand(sub => sub.setName('removetype').setDescription('Remove ticket type').addStringOption(opt => opt.setName('label').setDescription('Type label').setRequired(true)))
      .addSubcommand(sub => sub.setName('category').setDescription('Set category for ticket channels').addChannelOption(opt => opt.setName('category').setDescription('Category').setRequired(true))),

    // Verify group
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verification system')
      .addSubcommand(sub => sub.setName('setup').setDescription('Send verification button to current channel'))
      .addSubcommand(sub => sub.setName('channel').setDescription('Set default channel for verification').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('log').setDescription('Set log channel for verifications').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('role').setDescription('Set role to assign on verify').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)))
      .addSubcommand(sub => sub.setName('rules').setDescription('Set verification rules text').addStringOption(opt => opt.setName('text').setDescription('Rules').setRequired(true))),

    // Welcome group
    new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Welcome system')
      .addSubcommand(sub => sub.setName('channel').setDescription('Set welcome channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
      .addSubcommand(sub => sub.setName('message').setDescription('Set welcome message (use {user}, {guild})').addStringOption(opt => opt.setName('text').setDescription('Message').setRequired(true)))
      .addSubcommand(sub => sub.setName('image').setDescription('Set image for welcome embed').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true))),

    // Proof
    new SlashCommandBuilder()
      .setName('proof')
      .setDescription('Submit purchase proof')
      .addAttachmentOption(opt => opt.setName('proof').setDescription('Proof image/file').setRequired(false)),
    new SlashCommandBuilder().setName('setproofchannel').setDescription('Set channel for proof logs').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),

    // Staff role
    new SlashCommandBuilder().setName('setstaffrole').setDescription('Set staff role for tickets').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)),

    // Security toggles (owner only)
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
    new SlashCommandBuilder().setName('whitelist')
      .setDescription('Manage whitelist')
      .addSubcommand(sub => sub.setName('add').setDescription('Add user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('list').setDescription('List whitelisted users')),
    new SlashCommandBuilder().setName('trust').setDescription('Check trust score').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder().setName('resetstrikes').setDescription('Reset strikes').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder().setName('stats').setDescription('Show punishment statistics'),
    new SlashCommandBuilder().setName('logs').setDescription('Show recent logs'),
    new SlashCommandBuilder().setName('backup').setDescription('Create server backup')
  ];

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
    console.log('[NRT] Slash commands registered.');
  } catch (e) {
    console.error('[NRT] Command registration error:', e);
  }

  client.user.setActivity('NRT OMEGA', { type: ActivityType.Watching });
});

// ---------- WELCOME ----------
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
  await channel.send({ embeds: [embed] }).catch(() => {});
});

// ---------- MODALS ----------
class VerifyModal extends ModalBuilder {
  constructor(rules) {
    super().setCustomId('verifyModal').setTitle('Verification');
    const nameInput = new TextInputBuilder().setCustomId('fullName').setLabel('Full Name').setStyle(TextInputStyle.Short).setRequired(true);
    const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Reason for verification').setStyle(TextInputStyle.Paragraph).setRequired(true);
    this.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(reasonInput)
    );
  }
}

class TicketModal extends ModalBuilder {
  constructor(type) {
    super().setCustomId(`ticketModal_${type}`).setTitle(`Create ${type} Ticket`);
    const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true);
    this.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  }
}

class ProofModal extends ModalBuilder {
  constructor() {
    super().setCustomId('proofModal').setTitle('Submit Purchase Proof');
    const product = new TextInputBuilder().setCustomId('product').setLabel('Product').setStyle(TextInputStyle.Short).setRequired(true);
    const price = new TextInputBuilder().setCustomId('price').setLabel('Price').setStyle(TextInputStyle.Short).setRequired(true);
    const method = new TextInputBuilder().setCustomId('method').setLabel('Payment Method').setStyle(TextInputStyle.Short).setRequired(true);
    const transId = new TextInputBuilder().setCustomId('transId').setLabel('Transaction ID').setStyle(TextInputStyle.Short).setRequired(true);
    this.addComponents(
      new ActionRowBuilder().addComponents(product),
      new ActionRowBuilder().addComponents(price),
      new ActionRowBuilder().addComponents(method),
      new ActionRowBuilder().addComponents(transId)
    );
  }
}

// ---------- INTERACTION HANDLING ----------
client.on(Events.InteractionCreate, async (interaction) => {
  // ---- Slash commands ----
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guild } = interaction;
    const cfg = getConfig(guild.id);
    const isAdmin = interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);

    // ---- /help ----
    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('NRT OMEGA COMMANDS')
        .setColor(0x0099ff)
        .setDescription('All commands are slash commands.\nUse `/ticket panel` to deploy the ticket panel, etc.')
        .addFields(
          { name: 'Ticket', value: '`/ticket panel`, `/ticket channel`, `/ticket image`, `/ticket addtype`, `/ticket removetype`, `/ticket category`' },
          { name: 'Verify', value: '`/verify setup`, `/verify channel`, `/verify log`, `/verify role`, `/verify rules`' },
          { name: 'Welcome', value: '`/welcome channel`, `/welcome message`, `/welcome image`' },
          { name: 'Proof', value: '`/proof`, `/setproofchannel`' },
          { name: 'Staff', value: '`/setstaffrole`' },
          { name: 'Security (Owner)', value: '`/panic`, `/safemode`, `/lockdown`, `/unlockdown`, `/setlog`, `/antinuke`, `/antiraid`, `/antispam`, `/antibot`, `/antitoken`, `/whitelist`, `/trust`, `/resetstrikes`, `/stats`, `/logs`, `/backup`, `/status`' }
        )
        .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ---- /status ----
    if (commandName === 'status') {
      const stats = load(db.stats);
      const embed = new EmbedBuilder()
        .setTitle('System Status')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Anti-Nuke', value: cfg.antinuke ? 'ON' : 'OFF', inline: true },
          { name: 'Anti-Raid', value: cfg.antiraid ? 'ON' : 'OFF', inline: true },
          { name: 'Anti-Spam', value: cfg.antispam ? 'ON' : 'OFF', inline: true },
          { name: 'Anti-Bot', value: cfg.antibot ? 'ON' : 'OFF', inline: true },
          { name: 'Anti-Token', value: cfg.antitoken ? 'ON' : 'OFF', inline: true },
          { name: 'Panic Mode', value: cfg.panicMode ? 'ACTIVE' : 'INACTIVE', inline: true },
          { name: 'Bans', value: `${stats.totalBans || 0}`, inline: true },
          { name: 'Kicks', value: `${stats.totalKicks || 0}`, inline: true },
          { name: 'Timeouts', value: `${stats.totalTimeouts || 0}`, inline: true }
        )
        .setFooter({ text: 'NRT OMEGA' });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ---- Owner-only commands ----
    const ownerOnly = ['panic','safemode','lockdown','unlockdown','setlog','antinuke','antiraid','antispam','antibot','antitoken','whitelist','trust','resetstrikes','stats','logs','backup'];
    if (ownerOnly.includes(commandName) && !isOwner(interaction.user.id)) {
      await interaction.reply({ content: 'Owner only.', ephemeral: true });
      return;
    }

    // ---- /panic ----
    if (commandName === 'panic') {
      cfg.panicMode = !cfg.panicMode;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content: `Panic mode ${cfg.panicMode ? 'ACTIVATED' : 'DEACTIVATED'}`, ephemeral: true });
      return;
    }

    // ---- /safemode ----
    if (commandName === 'safemode') {
      cfg.safeMode = !cfg.safeMode;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content: `Safe mode ${cfg.safeMode ? 'ACTIVATED' : 'DEACTIVATED'}`, ephemeral: true });
      return;
    }

    // ---- /lockdown ----
    if (commandName === 'lockdown') {
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
        .forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {}));
      await interaction.reply({ content: 'Server locked down.', ephemeral: true });
      return;
    }

    // ---- /unlockdown ----
    if (commandName === 'unlockdown') {
      guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
        .forEach(c => c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {}));
      await interaction.reply({ content: 'Lockdown lifted.', ephemeral: true });
      return;
    }

    // ---- /setlog ----
    if (commandName === 'setlog') {
      const channel = options.getChannel('channel');
      cfg.logChannel = channel.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content: `Log channel set to ${channel}.`, ephemeral: true });
      return;
    }

    // ---- /antinuke, /antiraid, /antispam, /antibot, /antitoken ----
    const toggleMap = {
      antinuke: 'antinuke',
      antiraid: 'antiraid',
      antispam: 'antispam',
      antibot: 'antibot',
      antitoken: 'antitoken'
    };
    if (toggleMap[commandName]) {
      const state = options.getString('state');
      cfg[toggleMap[commandName]] = state === 'on';
      saveConfig(guild.id, cfg);
      await interaction.reply({ content: `${commandName} ${state === 'on' ? 'activated' : 'deactivated'}.`, ephemeral: true });
      return;
    }

    // ---- /whitelist ----
    if (commandName === 'whitelist') {
      const sub = options.getSubcommand();
      const wl = load(db.whitelist);
      if (sub === 'add') {
        const user = options.getUser('user');
        if (!wl.users.includes(user.id)) { wl.users.push(user.id); save(db.whitelist, wl); }
        await interaction.reply({ content: `Added ${user.tag} to whitelist.`, ephemeral: true });
      } else if (sub === 'remove') {
        const user = options.getUser('user');
        wl.users = wl.users.filter(id => id !== user.id);
        save(db.whitelist, wl);
        await interaction.reply({ content: `Removed ${user.tag}.`, ephemeral: true });
      } else if (sub === 'list') {
        const list = wl.users.map(id => `<@${id}>`).join('\n') || 'None';
        await interaction.reply({ content: `**Whitelisted users:**\n${list}`, ephemeral: true });
      }
      return;
    }

    // ---- /trust ----
    if (commandName === 'trust') {
      const user = options.getUser('user');
      const score = getTrust(guild.id, user.id);
      const strikes = getStrikes(guild.id, user.id);
      await interaction.reply({ content: `**${user.tag}**\nTrust: ${score}/100\nStrikes: ${strikes}`, ephemeral: true });
      return;
    }

    // ---- /resetstrikes ----
    if (commandName === 'resetstrikes') {
      const user = options.getUser('user');
      resetStrikes(guild.id, user.id);
      await interaction.reply({ content: `Strikes reset for ${user.tag}.`, ephemeral: true });
      return;
    }

    // ---- /stats (punishment stats) ----
    if (commandName === 'stats') {
      const stats = load(db.stats);
      const embed = new EmbedBuilder()
        .setTitle('Punishment Statistics')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Bans', value: `${stats.totalBans || 0}`, inline: true },
          { name: 'Kicks', value: `${stats.totalKicks || 0}`, inline: true },
          { name: 'Timeouts', value: `${stats.totalTimeouts || 0}`, inline: true },
          { name: 'Warnings', value: `${stats.totalWarnings || 0}`, inline: true },
          { name: 'Tokens Detected', value: `${stats.totalTokensDetected || 0}`, inline: true },
          { name: 'Raids Stopped', value: `${stats.totalRaidsStopped || 0}`, inline: true }
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ---- /logs ----
    if (commandName === 'logs') {
      const logs = load(db.logs);
      const guildLogs = logs[guild.id] || [];
      const recent = guildLogs.slice(-10).reverse().map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.title}`).join('\n');
      await interaction.reply({ content: `\`\`\`\nRECENT LOGS\n${recent || 'No logs'}\n\`\`\``, ephemeral: true });
      return;
    }

    // ---- /backup ----
    if (commandName === 'backup') {
      const backup = {
        timestamp: Date.now(),
        guildName: guild.name,
        channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })),
        roles: guild.roles.cache.map(r => ({ name: r.name, permissions: r.permissions.bitfield }))
      };
      const backups = load(db.backup);
      if (!backups[guild.id]) backups[guild.id] = [];
      backups[guild.id].push(backup);
      if (backups[guild.id].length > 10) backups[guild.id].shift();
      save(db.backup, backups);
      await interaction.reply({ content: 'Backup created.', ephemeral: true });
      return;
    }

    // ---- Ticket commands ----
    if (commandName === 'ticket') {
      const sub = options.getSubcommand();
      if (sub === 'panel') {
        if (!cfg.ticketCategoryId) {
          await interaction.reply({ content: 'Please set a ticket category using `/ticket category` first.', ephemeral: true });
          return;
        }
        const embed = new EmbedBuilder()
          .setTitle('Create a Ticket')
          .setDescription('Click a button below to open a ticket.')
          .setColor(0x1a1a1a)
          .setFooter({ text: 'NRT OMEGA' });
        if (cfg.ticketImageUrl) embed.setImage(cfg.ticketImageUrl);
        const row = new ActionRowBuilder();
        const types = cfg.ticketTypes || ['Support','Report','Other'];
        types.forEach(label => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_${label}`)
              .setLabel(label)
              .setStyle(ButtonStyle.Primary)
          );
        });
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Ticket panel sent.', ephemeral: true });
        return;
      }
      if (sub === 'channel') {
        const channel = options.getChannel('channel');
        cfg.ticketChannelId = channel.id;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Default ticket panel channel set to ${channel}.`, ephemeral: true });
        return;
      }
      if (sub === 'image') {
        const url = options.getString('url');
        cfg.ticketImageUrl = url;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: 'Ticket image updated.', ephemeral: true });
        return;
      }
      if (sub === 'addtype') {
        const label = options.getString('label');
        if (!cfg.ticketTypes) cfg.ticketTypes = ['Support','Report','Other'];
        if (cfg.ticketTypes.includes(label)) {
          await interaction.reply({ content: 'Type already exists.', ephemeral: true });
        } else {
          cfg.ticketTypes.push(label);
          saveConfig(guild.id, cfg);
          await interaction.reply({ content: `Added type "${label}".`, ephemeral: true });
        }
        return;
      }
      if (sub === 'removetype') {
        const label = options.getString('label');
        if (!cfg.ticketTypes) cfg.ticketTypes = ['Support','Report','Other'];
        cfg.ticketTypes = cfg.ticketTypes.filter(t => t !== label);
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Removed type "${label}".`, ephemeral: true });
        return;
      }
      if (sub === 'category') {
        const category = options.getChannel('category');
        if (category.type !== ChannelType.GuildCategory) {
          await interaction.reply({ content: 'Please select a category.', ephemeral: true });
          return;
        }
        cfg.ticketCategoryId = category.id;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Ticket category set to ${category.name}.`, ephemeral: true });
        return;
      }
    }

    // ---- Verify commands ----
    if (commandName === 'verify') {
      const sub = options.getSubcommand();
      if (sub === 'setup') {
        const rules = cfg.verifyRules || 'Please verify by clicking the button.';
        const embed = new EmbedBuilder()
          .setTitle('Verification')
          .setDescription(rules)
          .setColor(0x1a1a1a)
          .setFooter({ text: 'Click the button to verify.' });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verifyButton').setLabel('I Agree & Verify').setStyle(ButtonStyle.Success)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Verification panel sent.', ephemeral: true });
        return;
      }
      if (sub === 'channel') {
        const channel = options.getChannel('channel');
        cfg.verifyChannelId = channel.id;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Verify channel set to ${channel}.`, ephemeral: true });
        return;
      }
      if (sub === 'log') {
        const channel = options.getChannel('channel');
        cfg.verifyLogChannelId = channel.id;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Verify log channel set to ${channel}.`, ephemeral: true });
        return;
      }
      if (sub === 'role') {
        const role = options.getRole('role');
        cfg.verifyRoleId = role.id;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Verify role set to ${role.name}.`, ephemeral: true });
        return;
      }
      if (sub === 'rules') {
        const text = options.getString('text');
        cfg.verifyRules = text;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: 'Rules updated.', ephemeral: true });
        return;
      }
    }

    // ---- Welcome commands ----
    if (commandName === 'welcome') {
      const sub = options.getSubcommand();
      if (sub === 'channel') {
        const channel = options.getChannel('channel');
        cfg.welcomeChannelId = channel.id;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: `Welcome channel set to ${channel}.`, ephemeral: true });
        return;
      }
      if (sub === 'message') {
        const text = options.getString('text');
        cfg.welcomeMessage = text;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
        return;
      }
      if (sub === 'image') {
        const url = options.getString('url');
        cfg.welcomeImageUrl = url;
        saveConfig(guild.id, cfg);
        await interaction.reply({ content: 'Welcome image updated.', ephemeral: true });
        return;
      }
    }

    // ---- /setstaffrole ----
    if (commandName === 'setstaffrole') {
      if (!isAdmin) {
        await interaction.reply({ content: 'Admin required.', ephemeral: true });
        return;
      }
      const role = options.getRole('role');
      cfg.staffRoleId = role.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content: `Staff role set to ${role.name}.`, ephemeral: true });
      return;
    }

    // ---- /setproofchannel ----
    if (commandName === 'setproofchannel') {
      if (!isAdmin) {
        await interaction.reply({ content: 'Admin required.', ephemeral: true });
        return;
      }
      const channel = options.getChannel('channel');
      cfg.proofChannelId = channel.id;
      saveConfig(guild.id, cfg);
      await interaction.reply({ content: `Proof channel set to ${channel}.`, ephemeral: true });
      return;
    }

    // ---- /proof (modal) ----
    if (commandName === 'proof') {
      const modal = new ProofModal();
      await interaction.showModal(modal);
      return;
    }
  }

  // ---- Modal submissions ----
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verifyModal') {
      const fullName = interaction.fields.getTextInputValue('fullName');
      const reason = interaction.fields.getTextInputValue('reason');
      const embed = new EmbedBuilder()
        .setTitle('New Verification')
        .setColor(0x00ff00)
        .setDescription(`User: ${interaction.user}\nID: ${interaction.user.id}`)
        .addFields(
          { name: 'Full Name', value: fullName },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();
      const cfg = getConfig(interaction.guild.id);
      const logChannel = interaction.guild.channels.cache.get(cfg.verifyLogChannelId);
      if (logChannel) await logChannel.send({ embeds: [embed] });
      if (cfg.verifyRoleId) {
        const role = interaction.guild.roles.cache.get(cfg.verifyRoleId);
        if (role) await interaction.member.roles.add(role).catch(() => {});
      }
      await interaction.reply({ content: 'You have been verified.', ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('ticketModal_')) {
      const type = interaction.customId.replace('ticketModal_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const cfg = getConfig(interaction.guild.id);
      const category = interaction.guild.channels.cache.get(cfg.ticketCategoryId);
      if (!category) {
        await interaction.reply({ content: 'Ticket category not set. Use /ticket category.', ephemeral: true });
        return;
      }
      const count = category.children.cache.filter(c => c.name.startsWith('ticket-')).size + 1;
      const name = `ticket-${type.toLowerCase()}-${count}`;
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
      ];
      if (cfg.staffRoleId) {
        overwrites.push({ id: cfg.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
      }
      const channel = await category.children.create({ name, type: ChannelType.GuildText, permissionOverwrites: overwrites });
      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${type}`)
        .setDescription(`Created by ${interaction.user}\nReason: ${reason}`)
        .setColor(0x1a1a1a)
        .setFooter({ text: 'Use ticket commands in this channel.' });
      await channel.send({ content: `${interaction.user}`, embeds: [embed] });
      await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
      return;
    }

    if (interaction.customId === 'proofModal') {
      const product = interaction.fields.getTextInputValue('product');
      const price = interaction.fields.getTextInputValue('price');
      const method = interaction.fields.getTextInputValue('method');
      const transId = interaction.fields.getTextInputValue('transId');
      const embed = new EmbedBuilder()
        .setTitle('Purchase Proof')
        .setColor(0x00ff88)
        .addFields(
          { name: 'Buyer', value: `${interaction.user} (${interaction.user.id})` },
          { name: 'Product', value: product, inline: true },
          { name: 'Price', value: price, inline: true },
          { name: 'Payment Method', value: method, inline: true },
          { name: 'Transaction ID', value: transId, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'NRT OMEGA' });
      const cfg = getConfig(interaction.guild.id);
      const proofChannel = interaction.guild.channels.cache.get(cfg.proofChannelId);
      if (proofChannel) {
        await proofChannel.send({ embeds: [embed] });
        await proofChannel.send(`${interaction.user}, please attach your proof image here.`);
        await interaction.reply({ content: 'Proof logged. Attach image in the proof channel.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Proof channel not set. Use /setproofchannel.', ephemeral: true });
      }
      return;
    }
  }

  // ---- Button interactions ----
  if (interaction.isButton()) {
    if (interaction.customId === 'verifyButton') {
      const cfg = getConfig(interaction.guild.id);
      const modal = new VerifyModal(cfg.verifyRules);
      await interaction.showModal(modal);
      return;
    }
    if (interaction.customId.startsWith('ticket_')) {
      const type = interaction.customId.replace('ticket_', '');
      const modal = new TicketModal(type);
      await interaction.showModal(modal);
      return;
    }
  }
});

// ---------- SECURITY EVENTS ----------
// Anti-spam
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;
  const cfg = getConfig(message.guild.id);
  if (!cfg.antispam) return;
  if (isBypassed(message.guild.id, message.author.id)) return;
  if (isSpamming(message.author.id, message.guild.id)) {
    await smartPunish(message.guild, message.author.id, 2, 'Spamming', false);
    try { await message.delete(); } catch {}
  }
});

// Anti-bot (bot add)
client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.user.bot) return;
  const cfg = getConfig(member.guild.id);
  if (!cfg.antibot) return;
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.BotAdd);
  if (!executor || isBypassed(member.guild.id, executor.id)) return;
  await smartPunish(member.guild, executor.id, 10, 'Added unauthorized bot', true);
  await member.kick('Unauthorized bot').catch(() => {});
});

// Anti-raid (mass joins)
const joinTracker = new Map();
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  const cfg = getConfig(member.guild.id);
  if (!cfg.antiraid || cfg.panicMode) return;
  const guildId = member.guild.id;
  const now = Date.now();
  const list = (joinTracker.get(guildId) || []).concat(now).filter(t => now - t < cfg.raidWindow);
  joinTracker.set(guildId, list);
  if (list.length >= cfg.raidThreshold) {
    joinTracker.set(guildId, []);
    const stats = load(db.stats);
    stats.totalRaidsStopped = (stats.totalRaidsStopped || 0) + 1;
    save(db.stats, stats);
    if (cfg.autoLockdown) {
      member.guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
        .forEach(c => c.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {}));
      await member.guild.edit({ verificationLevel: 4 }).catch(() => {});
    }
    await sendLog(member.guild, 'RAID DETECTED', `Raid with ${list.length} joins`, [], 0xff0000, true);
    setTimeout(() => {
      member.guild.channels.cache.filter(c => c.type === ChannelType.GuildText)
        .forEach(c => c.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null }).catch(() => {}));
      member.guild.edit({ verificationLevel: 1 }).catch(() => {});
    }, cfg.lockdownDuration);
  }
  // Account age check
  const age = Date.now() - member.user.createdTimestamp;
  if (age < cfg.minAccountAge * 86400000 && !isBypassed(member.guild.id, member.id)) {
    await smartPunish(member.guild, member.id, 8, 'Underage account', true);
  }
});

// Anti-nuke (channel delete)
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

// Anti-token (message scanning)
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;
  const cfg = getConfig(message.guild.id);
  if (!cfg.antitoken) return;
  const content = message.content;
  const tokens = content.match(/[MNO][a-zA-Z\d_-]{23}\.[a-zA-Z\d_-]{6}\.[a-zA-Z\d_-]{27}/g) ||
                 content.match(/[a-zA-Z\d]{24}\.[a-zA-Z\d]{6}\.[a-zA-Z\d]{27}/g) ||
                 content.match(/mfa\.[a-zA-Z\d_-]{84}/g);
  if (tokens && tokens.length > 0) {
    const stats = load(db.stats);
    stats.totalTokensDetected = (stats.totalTokensDetected || 0) + 1;
    save(db.stats, stats);
    await smartPunish(message.guild, message.author.id, 5, 'Token leak detected', true);
    try { await message.delete(); } catch {}
  }
});

// ---------- LOGIN ----------
if (!process.env.BOT_TOKEN || !process.env.OWNER_ID) {
  console.error('[NRT] Missing BOT_TOKEN or OWNER_ID env.');
  process.exit(1);
}
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('[NRT] Login error:', err);
  process.exit(1);
});
