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

// ============================================================
//  ███╗   ██╗██████╗ ████████╗
//  ████╗  ██║██╔══██╗╚══██╔══╝
//  ██╔██╗ ██║██████╔╝   ██║   
//  ██║╚██╗██║██╔══██╗   ██║   
//  ██║ ╚████║██║  ██║   ██║   
//  ╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝   
// ============================================================

console.log('[NRT] ========================================');
console.log('[NRT] NRT OMEGA SECURITY PROTOCOL INITIALIZING');
console.log('[NRT] NODE_VERSION:', process.version);
console.log('[NRT] HOST: RAILWAY');
console.log('[NRT] ========================================');

// ============================================================
// EXPRESS SERVER
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('NRT OMEGA SECURITY SYSTEM ACTIVE - HOSTED ON RAILWAY');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime(),
    version: 'OMEGA_5.0_NRT',
    host: 'RAILWAY'
  });
});

app.listen(PORT, () => {
  console.log(`[NRT] WEB_SERVER_ACTIVE ON PORT ${PORT}`);
  console.log(`[NRT] HOST: RAILWAY`);
});

// ============================================================
// DISCORD CLIENT SETUP
// ============================================================
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

// ============================================================
// DATABASE SYSTEM
// ============================================================
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('[NRT] DATA_DIRECTORY_CREATED');
}

const db = {
  config: path.join(dataDir, 'config.json'),
  whitelist: path.join(dataDir, 'whitelist.json'),
  blacklist: path.join(dataDir, 'blacklist.json'),
  stats: path.join(dataDir, 'stats.json'),
  backup: path.join(dataDir, 'backup.json'),
  invites: path.join(dataDir, 'invites.json'),
  trust: path.join(dataDir, 'trust.json'),
  strikes: path.join(dataDir, 'strikes.json'),
  actions: path.join(dataDir, 'actions.json'),
  lockdown: path.join(dataDir, 'lockdown.json'),
  logs: path.join(dataDir, 'logs.json'),
  tokens: path.join(dataDir, 'tokens.json'),
  tokenLogs: path.join(dataDir, 'tokenLogs.json'),
  raidLogs: path.join(dataDir, 'raidLogs.json')
};

Object.values(db).forEach(file => {
  if (!fs.existsSync(file)) {
    const defaults = {
      'whitelist.json': { users: [], roles: [], admins: [] },
      'blacklist.json': { domains: [], tokens: [], users: [], ips: [] },
      'strikes.json': {},
      'actions.json': {},
      'lockdown.json': {},
      'logs.json': [],
      'trust.json': {},
      'stats.json': { totalBans: 0, totalKicks: 0, totalTimeouts: 0, totalWarnings: 0, totalTokensDetected: 0, totalRaidsStopped: 0 },
      'tokens.json': { detected: [] },
      'tokenLogs.json': { logs: [] },
      'raidLogs.json': { logs: [] },
      'config.json': {},
      'backup.json': {},
      'invites.json': {}
    };
    const defaultData = defaults[path.basename(file)] || {};
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    console.log(`[NRT] DATABASE_CREATED: ${path.basename(file)}`);
  }
});

const load = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

const save = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[NRT] SAVE_ERROR:', err.message);
  }
};

// ============================================================
// CONFIG SYSTEM
// ============================================================
function getConfig(guildId) {
  const config = load(db.config);
  if (!config[guildId]) {
    config[guildId] = {
      logChannel: null,
      logWebhook: null,
      logLevel: 'ALL',
      antinuke: true,
      antiraid: true,
      antispam: true,
      antilink: true,
      antibot: true,
      antiscam: true,
      antiphishing: true,
      antimalware: true,
      antitoken: true,
      antizalgo: true,
      antieveryone: true,
      antimassmention: true,
      antiduplicate: true,
      antiwebhook: true,
      antijoin: true,
      raidThreshold: 5,
      raidWindow: 10000,
      spamThreshold: 3,
      spamWindow: 3000,
      mentionLimit: 3,
      duplicateThreshold: 3,
      duplicateWindow: 5000,
      maxActions: 5,
      actionWindow: 15000,
      maxStrikes: 8,
      banThreshold: 5,
      kickThreshold: 3,
      timeoutThreshold: 2,
      minAccountAge: 3,
      minJoinAge: 3,
      autoLockdown: true,
      lockdownDuration: 300000,
      autoBan: true,
      autoKick: true,
      autoTimeout: true,
      trustSystem: true,
      minTrustScore: 20,
      verificationLevel: 'EXTREME',
      panicMode: false,
      safeMode: false,
      autoBackup: true,
      backupInterval: 1800000,
      trackInvites: true,
      welcomeMessage: null,
      welcomeChannel: null,
      logSpamPings: true,
      logTokenDetection: true,
      logBotAdd: true,
      // New fields for tickets and proof
      ticketCategoryId: null,
      proofChannelId: null,
      staffRoleId: null
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

// ============================================================
// TRUST & STRIKE SYSTEM (unchanged)
// ============================================================
function getTrust(guildId, userId) {
  const trustData = load(db.trust);
  const key = `${guildId}:${userId}`;
  return trustData[key] || 50;
}

function updateTrust(guildId, userId, delta, reason = '') {
  const trustData = load(db.trust);
  const key = `${guildId}:${userId}`;
  const current = trustData[key] || 50;
  const newScore = Math.max(0, Math.min(100, current + delta));
  trustData[key] = newScore;
  
  if (!trustData.history) trustData.history = {};
  if (!trustData.history[key]) trustData.history[key] = [];
  trustData.history[key].push({
    timestamp: Date.now(),
    oldScore: current,
    newScore: newScore,
    delta: delta,
    reason: reason
  });
  if (trustData.history[key].length > 50) trustData.history[key].shift();
  
  save(db.trust, trustData);
  return newScore;
}

function getStrikes(guildId, userId) {
  const strikeData = load(db.strikes);
  const key = `${guildId}:${userId}`;
  return strikeData[key] || 0;
}

function addStrike(guildId, userId, amount = 1, reason = '') {
  const strikeData = load(db.strikes);
  const key = `${guildId}:${userId}`;
  const current = strikeData[key] || 0;
  const newStrikes = Math.max(0, current + amount);
  strikeData[key] = newStrikes;
  
  if (!strikeData.reasons) strikeData.reasons = {};
  if (!strikeData.reasons[key]) strikeData.reasons[key] = [];
  strikeData.reasons[key].push({
    timestamp: Date.now(),
    amount: amount,
    reason: reason
  });
  if (strikeData.reasons[key].length > 20) strikeData.reasons[key].shift();
  
  save(db.strikes, strikeData);
  return newStrikes;
}

function resetStrikes(guildId, userId) {
  const strikeData = load(db.strikes);
  const key = `${guildId}:${userId}`;
  delete strikeData[key];
  if (strikeData.reasons) delete strikeData.reasons[key];
  save(db.strikes, strikeData);
}

// ============================================================
// ACTION TRACKER (unchanged)
// ============================================================
const actionTracker = new Map();

function trackAction(userId, actionType, guildId, window = 30000) {
  const key = `${guildId}:${userId}:${actionType}`;
  const now = Date.now();
  const times = (actionTracker.get(key) || []).filter(t => now - t < window);
  times.push(now);
  actionTracker.set(key, times);
  return times.length;
}

// ============================================================
// SPAM TRACKER (unchanged)
// ============================================================
const spamTracker = new Map();

function isSpamming(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const window = 3000;
  const limit = 3;
  
  if (!spamTracker.has(key)) {
    spamTracker.set(key, []);
  }
  
  const times = spamTracker.get(key).filter(t => now - t < window);
  times.push(now);
  spamTracker.set(key, times);
  
  return times.length >= limit;
}

// ============================================================
// HELPER FUNCTIONS (unchanged)
// ============================================================
const isOwner = (id) => id === process.env.OWNER_ID;
const isWhitelisted = (guildId, userId) => {
  const whitelist = load(db.whitelist);
  return whitelist.users?.includes(userId) || false;
};
const isAdminWhitelisted = (guildId, userId) => {
  const whitelist = load(db.whitelist);
  return whitelist.admins?.includes(userId) || false;
};

const isBypassed = (guildId, userId) => {
  return isOwner(userId) || isWhitelisted(guildId, userId) || isAdminWhitelisted(guildId, userId);
};

const hasHighTrust = (guildId, userId) => {
  return getTrust(guildId, userId) >= 70;
};

// ============================================================
// TOKEN DETECTION SYSTEM (unchanged)
// ============================================================
function detectTokens(content) {
  const tokens = [];
  const botTokenRegex = /[MNO][a-zA-Z\d_-]{23}\.[a-zA-Z\d_-]{6}\.[a-zA-Z\d_-]{27}/g;
  const userTokenRegex = /[a-zA-Z\d]{24}\.[a-zA-Z\d]{6}\.[a-zA-Z\d]{27}/g;
  const mfaTokenRegex = /mfa\.[a-zA-Z\d_-]{84}/g;
  
  let match;
  while ((match = botTokenRegex.exec(content)) !== null) {
    tokens.push({ type: 'BOT_TOKEN', token: match[0] });
  }
  while ((match = userTokenRegex.exec(content)) !== null) {
    tokens.push({ type: 'USER_TOKEN', token: match[0] });
  }
  while ((match = mfaTokenRegex.exec(content)) !== null) {
    tokens.push({ type: 'MFA_TOKEN', token: match[0] });
  }
  return tokens;
}

// ============================================================
// PROTECTION MESSAGE (updated with NRT)
// ============================================================
async function sendProtectionMessage(channel, user, action) {
  const embed = new EmbedBuilder()
    .setTitle('PROTECTED BY NRT')
    .setDescription(`\`\`\`\n${action} TRIGGERED\nUSER: ${user.tag}\nACTION: ${action}\nSTATUS: EXECUTED\n═══════════════════════════════════\nNRT OMEGA SECURITY\nDOWN 4 NRT\n═══════════════════════════════════\n\`\`\``)
    .setColor(0x0099ff)
    .setTimestamp()
    .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' });
  
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ============================================================
// LOGGING SYSTEM (updated with NRT)
// ============================================================
async function sendLog(guild, title, description, fields = [], color = 0x00ff88, critical = false) {
  try {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannel) return;
    const channel = guild.channels.cache.get(cfg.logChannel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`[ ${critical ? 'CRITICAL' : 'SECURITY'} ] ${title}`)
      .setDescription(description)
      .setColor(color)
      .setTimestamp()
      .setFooter({ text: 'NRT OMEGA SECURITY | DOWN 4 NRT' });

    if (fields.length > 0) embed.addFields(fields);
    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('[NRT] LOG_ERROR:', err.message);
  }
}

async function sendDetailedLog(guild, data) {
  try {
    const cfg = getConfig(guild.id);
    if (!cfg.logChannel) return;
    const channel = guild.channels.cache.get(cfg.logChannel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('[ DETAILED LOG ]')
      .setDescription('`' + data.action + '`')
      .setColor(0x0099ff)
      .setTimestamp()
      .addFields(data.fields || [])
      .setFooter({ text: 'NRT OMEGA SECURITY | DOWN 4 NRT' });

    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('[NRT] DETAILED_LOG_ERROR:', err.message);
  }
}

// ============================================================
// AUDIT LOG HELPER (unchanged)
// ============================================================
async function getAuditExecutor(guild, actionType, targetId = null, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise(r => setTimeout(r, 300));
      const logs = await guild.fetchAuditLogs({ limit: 10, type: actionType });
      let entry = targetId ? logs.entries.find(e => e.target?.id === targetId) : logs.entries.first();
      if (entry && entry.executor) {
        return entry.executor;
      }
    } catch (err) {
      console.error('[NRT] AUDIT_ERROR:', err.message);
    }
  }
  return null;
}

// ============================================================
// SMART PUNISHMENT SYSTEM (unchanged)
// ============================================================
async function smartPunish(guild, userId, severity, reason, instant = false) {
  if (isBypassed(guild.id, userId)) {
    console.log(`[NRT] BYPASSED: ${userId} - ${reason}`);
    return 'whitelisted';
  }

  let member = null;
  for (let i = 0; i < 3; i++) {
    try {
      member = await guild.members.fetch(userId);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  if (!member) return 'not_found';

  if (hasHighTrust(guild.id, userId)) {
    severity = Math.max(1, severity - 3);
  }

  const cfg = getConfig(guild.id);
  const newStrikes = addStrike(guild.id, userId, severity, reason);
  updateTrust(guild.id, userId, -severity * 5, reason);

  let action = 0;
  if (instant) action = 4;
  else if (newStrikes >= cfg.maxStrikes) action = 3;
  else if (newStrikes >= cfg.banThreshold && cfg.autoBan) action = 3;
  else if (newStrikes >= cfg.kickThreshold && cfg.autoKick) action = 2;
  else if (newStrikes >= cfg.timeoutThreshold && cfg.autoTimeout) action = 1;
  else action = 0;

  let result = 'warning';
  try {
    if (action === 4 || action === 3) {
      if (member.bannable) {
        await member.ban({ reason: `NRT: ${reason} | STRIKES: ${newStrikes}` });
        result = 'banned';
        const stats = load(db.stats);
        stats.totalBans = (stats.totalBans || 0) + 1;
        save(db.stats, stats);
        await sendLog(guild, 'USER_BANNED', 'User has been banned', [
          { name: 'USER', value: `<@${userId}>`, inline: true },
          { name: 'REASON', value: reason, inline: true },
          { name: 'STRIKES', value: `${newStrikes}`, inline: true }
        ], 0xff0000, true);
      }
    } else if (action === 2) {
      if (member.kickable) {
        await member.kick(`NRT: ${reason} | STRIKES: ${newStrikes}`);
        result = 'kicked';
        const stats = load(db.stats);
        stats.totalKicks = (stats.totalKicks || 0) + 1;
        save(db.stats, stats);
        await sendLog(guild, 'USER_KICKED', 'User has been kicked', [
          { name: 'USER', value: `<@${userId}>`, inline: true },
          { name: 'REASON', value: reason, inline: true },
          { name: 'STRIKES', value: `${newStrikes}`, inline: true }
        ], 0xff6600, true);
      }
    } else if (action === 1) {
      if (member.moderatable) {
        await member.timeout(300000, `NRT: ${reason}`);
        result = 'timeout';
        const stats = load(db.stats);
        stats.totalTimeouts = (stats.totalTimeouts || 0) + 1;
        save(db.stats, stats);
        await sendLog(guild, 'USER_TIMEOUT', 'User has been timed out', [
          { name: 'USER', value: `<@${userId}>`, inline: true },
          { name: 'REASON', value: reason, inline: true },
          { name: 'DURATION', value: '5 MINUTES', inline: true },
          { name: 'STRIKES', value: `${newStrikes}`, inline: true }
        ], 0xffaa00, true);
      }
    } else {
      await sendLog(guild, 'USER_WARNED', 'User received a warning', [
        { name: 'USER', value: `<@${userId}>`, inline: true },
        { name: 'REASON', value: reason, inline: true },
        { name: 'STRIKES', value: `${newStrikes}/${cfg.maxStrikes}`, inline: true }
      ], 0xffff00);
      result = 'warning';
    }
  } catch (err) {
    console.error('[NRT] PUNISH_ERROR:', err.message);
    result = 'failed';
  }

  return result;
}

// ============================================================
// !HELP COMMAND (updated with NRT)
// ============================================================
async function sendModernHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle('NRT OMEGA SECURITY')
    .setDescription('```\nADVANCED SECURITY PROTOCOL v5.0\nHOST: RAILWAY\nPROTECTED BY NRT (DOWN 4 NRT)\n```')
    .setColor(0x0099ff)
    .setTimestamp()
    .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' })
    .addFields(
      { 
        name: 'SECURITY COMMANDS', 
        value: '```\n!status      ─ Display system status\n!panic       ─ Toggle PANIC MODE\n!safemode    ─ Toggle SAFE MODE\n!lockdown    ─ Lock all channels\n!unlockdown  ─ Unlock all channels\n!backup      ─ Create server backup\n```', 
        inline: false 
      },
      { 
        name: 'PROTECTION TOGGLES', 
        value: '```\n!antinuke on/off   ─ Anti-Nuke Protection\n!antiraid on/off   ─ Anti-Raid Protection\n!antispam on/off   ─ Anti-Spam Protection\n!antiscam on/off   ─ Anti-Scam Protection\n!antitoken on/off  ─ Token Detection\n!antilink on/off   ─ Link Protection\n!antibot on/off    ─ Bot Protection\n```', 
        inline: false 
      },
      { 
        name: 'CONFIGURATION', 
        value: '```\n!setlog #channel   ─ Set log channel\n!thresholds        ─ View thresholds\n!thresholds set    ─ Modify thresholds\n```', 
        inline: false 
      },
      { 
        name: 'WHITELIST SYSTEM', 
        value: '```\n!whitelist add @user   ─ Add user to whitelist\n!whitelist remove @user ─ Remove from whitelist\n!whitelist list        ─ View whitelisted users\n!trust @user           ─ Check trust score\n!resetstrikes @user    ─ Reset user strikes\n```', 
        inline: false 
      },
      { 
        name: 'STATISTICS', 
        value: '```\n!stats    ─ Show security statistics\n!logs     ─ Show recent logs\n!help     ─ Show this menu\n!ping     ─ Check bot latency\n```', 
        inline: false 
      },
      { 
        name: 'SLASH COMMANDS', 
        value: '```\n/ticket   ─ Send ticket panel with choices\n/proof    ─ Submit purchase proof\n/setproofchannel ─ Set channel for proof logs\n/setcategory     ─ Set category for tickets\n```', 
        inline: false 
      },
      { 
        name: 'SYSTEM INFO', 
        value: '```\nBOT NAME: NRT OMEGA\nVERSION: 5.0\nHOST: RAILWAY\nPROTECTED BY: NRT (DOWN 4 NRT)\nSTATUS: ONLINE\n```', 
        inline: false 
      }
    );

  await message.reply({ embeds: [embed] });
}

// ============================================================
// BACKUP SYSTEM (unchanged)
// ============================================================
async function createBackup(guild) {
  try {
    const backup = {
      timestamp: Date.now(),
      guildName: guild.name,
      guildId: guild.id,
      ownerId: guild.ownerId,
      roles: guild.roles.cache.map(r => ({
        name: r.name,
        color: r.color,
        permissions: r.permissions.bitfield,
        position: r.position,
        hoist: r.hoist,
        mentionable: r.mentionable,
        id: r.id
      })),
      channels: guild.channels.cache.map(c => ({
        name: c.name,
        type: c.type,
        position: c.position,
        topic: c.topic || null,
        id: c.id,
        parentId: c.parentId || null
      })),
      emojis: guild.emojis.cache.map(e => ({
        name: e.name,
        url: e.url,
        animated: e.animated,
        id: e.id
      }))
    };
    
    const backups = load(db.backup);
    if (!backups[guild.id]) backups[guild.id] = [];
    backups[guild.id].push(backup);
    if (backups[guild.id].length > 10) backups[guild.id].shift();
    save(db.backup, backups);
    console.log('[NRT] BACKUP_CREATED:', guild.name);
    return backup;
  } catch (err) {
    console.error('[NRT] BACKUP_ERROR:', err.message);
    return null;
  }
}

// ============================================================
// READY EVENT
// ============================================================
client.once(Events.ClientReady, async () => {
  console.log('[NRT] ========================================');
  console.log('[NRT] NRT OMEGA SECURITY SYSTEM ONLINE');
  console.log('[NRT] ========================================');
  console.log(`[NRT] OWNER: ${process.env.OWNER_ID}`);
  console.log(`[NRT] BOT: ${client.user.tag} (${client.user.id})`);
  console.log(`[NRT] SERVERS: ${client.guilds.cache.size}`);
  console.log(`[NRT] NODE: ${process.version}`);
  console.log(`[NRT] HOST: RAILWAY`);
  console.log('[NRT] ========================================');
  console.log('[NRT] PROTECTED BY NRT (DOWN 4 NRT)');
  console.log('[NRT] ========================================');

  client.user.setActivity('PROTECTED BY NRT (DOWN 4 NRT)', { type: ActivityType.Watching });

  // Register slash commands globally
  const commands = [
    new SlashCommandBuilder().setName('ticket').setDescription('Send the ticket panel with choice buttons'),
    new SlashCommandBuilder().setName('proof').setDescription('Submit purchase proof'),
    new SlashCommandBuilder().setName('setproofchannel').setDescription('Set the channel for proof logs').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
    new SlashCommandBuilder().setName('setcategory').setDescription('Set the category for ticket channels').addChannelOption(opt => opt.setName('category').setDescription('Category').setRequired(true)),
    new SlashCommandBuilder().setName('setstaffrole').setDescription('Set the staff role for tickets').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
  ];

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
    console.log('[NRT] Slash commands registered globally.');
  } catch (e) {
    console.error('[NRT] Slash command registration error:', e);
  }

  // Auto backup
  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      const cfg = getConfig(guild.id);
      if (cfg.autoBackup !== false) {
        createBackup(guild);
      }
    });
  }, 1800000);
});

// ============================================================
// SLASH COMMAND INTERACTIONS
// ============================================================
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const cfg = getConfig(interaction.guild.id);

    // /ticket - send the panel
    if (commandName === 'ticket') {
      const embed = new EmbedBuilder()
        .setTitle('OPEN A TICKET')
        .setDescription('What do you need help with?')
        .setColor(0x1a1a1a)
        .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('ticket_purchase').setLabel('Purchase').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_payment').setLabel('Payment').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_proof').setLabel('Proof').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_support').setLabel('Support').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_report').setLabel('Report').setStyle(ButtonStyle.Primary)
        );
      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('ticket_partnership').setLabel('Partnership').setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row, row2] });
      return;
    }

    // /proof - open modal
    if (commandName === 'proof') {
      const modal = new ModalBuilder()
        .setCustomId('proofModal')
        .setTitle('Submit Purchase Proof');

      const product = new TextInputBuilder()
        .setCustomId('product')
        .setLabel('Product')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const price = new TextInputBuilder()
        .setCustomId('price')
        .setLabel('Price')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const method = new TextInputBuilder()
        .setCustomId('method')
        .setLabel('Payment Method')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const transId = new TextInputBuilder()
        .setCustomId('transId')
        .setLabel('Transaction ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(product),
        new ActionRowBuilder().addComponents(price),
        new ActionRowBuilder().addComponents(method),
        new ActionRowBuilder().addComponents(transId)
      );

      await interaction.showModal(modal);
      return;
    }

    // /setproofchannel
    if (commandName === 'setproofchannel') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'You need Administrator permission.', ephemeral: true });
        return;
      }
      const channel = interaction.options.getChannel('channel');
      cfg.proofChannelId = channel.id;
      saveConfig(interaction.guild.id, cfg);
      await interaction.reply({ content: `Proof channel set to ${channel}.`, ephemeral: true });
      return;
    }

    // /setcategory
    if (commandName === 'setcategory') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'You need Administrator permission.', ephemeral: true });
        return;
      }
      const category = interaction.options.getChannel('category');
      if (category.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: 'Please select a category.', ephemeral: true });
        return;
      }
      cfg.ticketCategoryId = category.id;
      saveConfig(interaction.guild.id, cfg);
      await interaction.reply({ content: `Ticket category set to ${category.name}.`, ephemeral: true });
      return;
    }

    // /setstaffrole
    if (commandName === 'setstaffrole') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'You need Administrator permission.', ephemeral: true });
        return;
      }
      const role = interaction.options.getRole('role');
      cfg.staffRoleId = role.id;
      saveConfig(interaction.guild.id, cfg);
      await interaction.reply({ content: `Staff role set to ${role.name}.`, ephemeral: true });
      return;
    }
  }

  // ---------- MODAL SUBMISSIONS ----------
  if (interaction.isModalSubmit()) {
    // Proof modal
    if (interaction.customId === 'proofModal') {
      const product = interaction.fields.getTextInputValue('product');
      const price = interaction.fields.getTextInputValue('price');
      const method = interaction.fields.getTextInputValue('method');
      const transId = interaction.fields.getTextInputValue('transId');

      const embed = new EmbedBuilder()
        .setTitle('PURCHASE PROOF')
        .setColor(0x00ff88)
        .addFields(
          { name: 'Buyer', value: `${interaction.user} (${interaction.user.id})`, inline: false },
          { name: 'Product', value: product, inline: true },
          { name: 'Price', value: price, inline: true },
          { name: 'Payment Method', value: method, inline: true },
          { name: 'Transaction ID', value: transId, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' });

      const cfg = getConfig(interaction.guild.id);
      const proofChannel = interaction.guild.channels.cache.get(cfg.proofChannelId);
      if (proofChannel) {
        // If proof attachment is provided, we can't get it from modal directly, but we can ask user to upload after?
        // We'll just send the embed and ask for attachment in a follow-up message? Better: we can allow attachment in the modal? Modal doesn't support file upload.
        // We'll send the embed and then ask user to upload proof image in the channel as a reply.
        await proofChannel.send({ embeds: [embed] });
        await proofChannel.send(`${interaction.user}, please attach your proof image/file here.`);
        await interaction.reply({ content: 'Your proof has been logged. Please attach the proof image in the proof channel.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Proof channel not set. Please ask an admin to use /setproofchannel.', ephemeral: true });
      }
      return;
    }

    // Ticket modal (from buttons)
    if (interaction.customId.startsWith('ticketModal_')) {
      const ticketType = interaction.customId.replace('ticketModal_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const cfg = getConfig(interaction.guild.id);
      const category = interaction.guild.channels.cache.get(cfg.ticketCategoryId);
      if (!category) {
        await interaction.reply({ content: 'Ticket category not set. Please ask an admin to use /setcategory.', ephemeral: true });
        return;
      }
      const ticketCount = category.children.cache.filter(ch => ch.name.startsWith('ticket-')).size + 1;
      const name = `ticket-${ticketType}-${ticketCount}`;
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ];
      if (cfg.staffRoleId) {
        overwrites.push({ id: cfg.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
      }
      const channel = await category.children.create({ name, type: ChannelType.GuildText, permissionOverwrites: overwrites });
      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${ticketType}`)
        .setDescription(`Created by ${interaction.user}\nReason: ${reason}`)
        .setColor(0x1a1a1a)
        .setFooter({ text: 'Use /close, /delete, etc. in this channel' });
      await channel.send({ content: `${interaction.user}`, embeds: [embed] });
      await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
      return;
    }
  }

  // ---------- BUTTON INTERACTIONS ----------
  if (interaction.isButton()) {
    // Ticket type buttons
    if (interaction.customId.startsWith('ticket_')) {
      const type = interaction.customId.replace('ticket_', '');
      const modal = new ModalBuilder()
        .setCustomId(`ticketModal_${type}`)
        .setTitle(`Create ${type} Ticket`);
      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for ticket')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }
  }
});

// ============================================================
// MESSAGE CREATE EVENT - ALL COMMANDS (unchanged except strings)
// ============================================================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.author.system) return;
  if (message.webhookId) return;
  if (!message.guild) return;

  const cfg = getConfig(message.guild.id);
  const userId = message.author.id;
  const guildId = message.guild.id;
  const member = message.member;

  // SPAM DETECTION
  if (cfg.antispam && !isBypassed(guildId, userId)) {
    if (isSpamming(userId, guildId)) {
      console.log(`[SPAM] SPAM DETECTED: ${message.author.tag}`);
      try {
        const messages = await message.channel.messages.fetch({ limit: 10 });
        const spamMessages = messages.filter(m => m.author.id === userId);
        for (const msg of spamMessages) {
          await msg.delete().catch(() => {});
        }
      } catch (err) {
        console.error('[SPAM] DELETE_ERROR:', err.message);
      }
      try {
        await member.kick('SPAMMING - PROTECTED BY NRT (DOWN 4 NRT)');
        await sendProtectionMessage(message.channel, message.author, 'SPAM KICK');
        await sendLog(message.guild, 'SPAMMER KICKED', 'User kicked for spamming', [
          { name: 'USER', value: `<@${userId}> (${message.author.tag})`, inline: true },
          { name: 'REASON', value: 'SPAMMING', inline: true },
          { name: 'ACTION', value: 'KICKED', inline: true },
          { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
        ], 0xff6600, true);
      } catch (err) {
        console.error('[SPAM] KICK_ERROR:', err.message);
      }
      return;
    }
  }

  // COMMAND HANDLER (prefix !)
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args[0].toLowerCase();

  if (cmd === 'help') {
    await sendModernHelp(message);
    return;
  }
  if (cmd === 'ping') {
    const latency = Date.now() - message.createdTimestamp;
    await message.reply(`Pong! Latency: ${latency}ms\nHost: RAILWAY\nProtected by NRT (DOWN 4 NRT)`);
    return;
  }
  if (cmd === 'status') {
    const stats = load(db.stats);
    const embed = new EmbedBuilder()
      .setTitle('NRT OMEGA SECURITY STATUS')
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' })
      .addFields(
        { name: 'PROTECTIONS', value: '==================', inline: false },
        { name: 'ANTI_NUKE', value: cfg.antinuke ? 'ACTIVE' : 'INACTIVE', inline: true },
        { name: 'ANTI_RAID', value: cfg.antiraid ? 'ACTIVE' : 'INACTIVE', inline: true },
        { name: 'ANTI_SPAM', value: cfg.antispam ? 'ACTIVE' : 'INACTIVE', inline: true },
        { name: 'ANTI_BOT', value: cfg.antibot ? 'ACTIVE' : 'INACTIVE', inline: true },
        { name: 'ANTI_TOKEN', value: cfg.antitoken ? 'ACTIVE' : 'INACTIVE', inline: true },
        { name: 'STATISTICS', value: '==================', inline: false },
        { name: 'TOTAL_BANS', value: `${stats.totalBans || 0}`, inline: true },
        { name: 'TOTAL_KICKS', value: `${stats.totalKicks || 0}`, inline: true },
        { name: 'TOTAL_TIMEOUTS', value: `${stats.totalTimeouts || 0}`, inline: true },
        { name: 'TOKENS_DETECTED', value: `${stats.totalTokensDetected || 0}`, inline: true },
        { name: 'SYSTEM', value: '==================', inline: false },
        { name: 'PANIC_MODE', value: cfg.panicMode ? 'ACTIVATED' : 'INACTIVE', inline: true },
        { name: 'HOST', value: 'RAILWAY', inline: true },
        { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
      );
    await message.reply({ embeds: [embed] });
    return;
  }

  // OWNER ONLY
  if (!isOwner(message.author.id)) {
    await message.reply('```\nPERMISSION DENIED: OWNER ONLY\n```');
    return;
  }

  if (cmd === 'panic') {
    cfg.panicMode = !cfg.panicMode;
    saveConfig(guildId, cfg);
    await message.reply(`\`\`\`PANIC_MODE: ${cfg.panicMode ? 'ACTIVATED' : 'DEACTIVATED'}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    return;
  }
  if (cmd === 'safemode') {
    cfg.safeMode = !cfg.safeMode;
    saveConfig(guildId, cfg);
    await message.reply(`\`\`\`SAFE_MODE: ${cfg.safeMode ? 'ACTIVATED' : 'DEACTIVATED'}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    return;
  }
  if (cmd === 'lockdown') {
    message.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .forEach(c => c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {}));
    await message.reply('```\nSERVER_LOCKDOWN_INITIATED\nPROTECTED BY NRT (DOWN 4 NRT)\n```');
    return;
  }
  if (cmd === 'unlockdown') {
    message.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText)
      .forEach(c => c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {}));
    await message.reply('```\nSERVER_LOCKDOWN_LIFTED\nPROTECTED BY NRT (DOWN 4 NRT)\n```');
    return;
  }
  if (cmd === 'setlog') {
    const channel = message.mentions.channels.first();
    if (channel) {
      cfg.logChannel = channel.id;
      saveConfig(guildId, cfg);
      await message.reply(`\`\`\`LOG_CHANNEL_CONFIGURED: ${channel.name}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    } else {
      await message.reply('```\nPlease mention a channel: !setlog #channel\n```');
    }
    return;
  }
  if (cmd === 'backup') {
    await createBackup(message.guild);
    await message.reply('```\nBACKUP_CREATED_SUCCESSFULLY\nPROTECTED BY NRT (DOWN 4 NRT)\n```');
    return;
  }
  if (cmd === 'antinuke') {
    if (args[1] === 'on') { cfg.antinuke = true; saveConfig(guildId, cfg); await message.reply('```\nANTI_NUKE: ACTIVATED\nPROTECTED BY NRT (DOWN 4 NRT)\n```'); }
    else if (args[1] === 'off') { cfg.antinuke = false; saveConfig(guildId, cfg); await message.reply('```\nANTI_NUKE: DEACTIVATED\n```'); }
    else { await message.reply('```\nUsage: !antinuke on/off\n```'); }
    return;
  }
  if (cmd === 'antiraid') {
    if (args[1] === 'on') { cfg.antiraid = true; saveConfig(guildId, cfg); await message.reply('```\nANTI_RAID: ACTIVATED\nPROTECTED BY NRT (DOWN 4 NRT)\n```'); }
    else if (args[1] === 'off') { cfg.antiraid = false; saveConfig(guildId, cfg); await message.reply('```\nANTI_RAID: DEACTIVATED\n```'); }
    else { await message.reply('```\nUsage: !antiraid on/off\n```'); }
    return;
  }
  if (cmd === 'antispam') {
    if (args[1] === 'on') { cfg.antispam = true; saveConfig(guildId, cfg); await message.reply('```\nANTI_SPAM: ACTIVATED\nPROTECTED BY NRT (DOWN 4 NRT)\n```'); }
    else if (args[1] === 'off') { cfg.antispam = false; saveConfig(guildId, cfg); await message.reply('```\nANTI_SPAM: DEACTIVATED\n```'); }
    else { await message.reply('```\nUsage: !antispam on/off\n```'); }
    return;
  }
  if (cmd === 'antibot') {
    if (args[1] === 'on') { cfg.antibot = true; saveConfig(guildId, cfg); await message.reply('```\nANTI_BOT: ACTIVATED\nPROTECTED BY NRT (DOWN 4 NRT)\n```'); }
    else if (args[1] === 'off') { cfg.antibot = false; saveConfig(guildId, cfg); await message.reply('```\nANTI_BOT: DEACTIVATED\n```'); }
    else { await message.reply('```\nUsage: !antibot on/off\n```'); }
    return;
  }
  if (cmd === 'antitoken') {
    if (args[1] === 'on') { cfg.antitoken = true; saveConfig(guildId, cfg); await message.reply('```\nANTI_TOKEN: ACTIVATED\nPROTECTED BY NRT (DOWN 4 NRT)\n```'); }
    else if (args[1] === 'off') { cfg.antitoken = false; saveConfig(guildId, cfg); await message.reply('```\nANTI_TOKEN: DEACTIVATED\n```'); }
    else { await message.reply('```\nUsage: !antitoken on/off\n```'); }
    return;
  }
  if (cmd === 'thresholds') {
    if (args[1] === 'set') {
      const key = args[2];
      const value = parseInt(args[3]);
      if (key && !isNaN(value)) {
        cfg[key] = value;
        saveConfig(guildId, cfg);
        await message.reply(`\`\`\`THRESHOLD UPDATED: ${key} = ${value}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
      } else {
        await message.reply('```\nUsage: !thresholds set <key> <value>\nKEYS: raidThreshold, spamThreshold, mentionLimit, maxStrikes, banThreshold, kickThreshold, timeoutThreshold, minAccountAge\n```');
      }
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('SECURITY THRESHOLDS')
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' })
      .addFields(
        { name: 'RAID PROTECTION', value: '```\nRaid Threshold: ' + cfg.raidThreshold + '\nRaid Window: ' + cfg.raidWindow/1000 + 's\n```', inline: true },
        { name: 'SPAM PROTECTION', value: '```\nSpam Threshold: ' + cfg.spamThreshold + '\nSpam Window: ' + cfg.spamWindow/1000 + 's\n```', inline: true },
        { name: 'MENTION PROTECTION', value: '```\nMention Limit: ' + cfg.mentionLimit + '\n```', inline: true },
        { name: 'PUNISHMENT', value: '```\nMax Strikes: ' + cfg.maxStrikes + '\nBan Threshold: ' + cfg.banThreshold + '\nKick Threshold: ' + cfg.kickThreshold + '\nTimeout Threshold: ' + cfg.timeoutThreshold + '\n```', inline: true }
      );
    await message.reply({ embeds: [embed] });
    return;
  }
  if (cmd === 'whitelist') {
    const action = args[1];
    const user = message.mentions.users.first();
    const whitelist = load(db.whitelist);
    if (action === 'add' && user) {
      if (!whitelist.users.includes(user.id)) {
        whitelist.users.push(user.id);
        save(db.whitelist, whitelist);
        await message.reply(`\`\`\`USER_WHITELISTED: ${user.tag}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
      } else {
        await message.reply(`\`\`\`USER_ALREADY_WHITELISTED: ${user.tag}\`\`\``);
      }
    } else if (action === 'remove' && user) {
      whitelist.users = whitelist.users.filter(id => id !== user.id);
      save(db.whitelist, whitelist);
      await message.reply(`\`\`\`USER_REMOVED: ${user.tag}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    } else if (action === 'list') {
      const users = whitelist.users.map(id => `<@${id}>`).join('\n') || 'NONE';
      await message.reply(`\`\`\`WHITELISTED_USERS:\n${users}\n\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    } else {
      await message.reply('```\nUsage: !whitelist add/remove/list @user\n```');
    }
    return;
  }
  if (cmd === 'trust') {
    const user = message.mentions.users.first();
    if (user) {
      const score = getTrust(guildId, user.id);
      const strikes = getStrikes(guildId, user.id);
      await message.reply(`\`\`\`USER: ${user.tag}\nTRUST_SCORE: ${score}/100\nSTRIKES: ${strikes}\n\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    } else {
      await message.reply('```\nUsage: !trust @user\n```');
    }
    return;
  }
  if (cmd === 'resetstrikes') {
    const user = message.mentions.users.first();
    if (user) {
      resetStrikes(guildId, user.id);
      await message.reply(`\`\`\`STRIKES_RESET: ${user.tag}\nPROTECTED BY NRT (DOWN 4 NRT)\`\`\``);
    } else {
      await message.reply('```\nUsage: !resetstrikes @user\n```');
    }
    return;
  }
  if (cmd === 'stats') {
    const stats = load(db.stats);
    const embed = new EmbedBuilder()
      .setTitle('SECURITY STATISTICS')
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: 'NRT OMEGA | DOWN 4 NRT' })
      .addFields(
        { name: 'PUNISHMENTS', value: `\`\`\`Total Bans: ${stats.totalBans || 0}\nTotal Kicks: ${stats.totalKicks || 0}\nTotal Timeouts: ${stats.totalTimeouts || 0}\nTotal Warnings: ${stats.totalWarnings || 0}\`\`\``, inline: true },
        { name: 'TOKENS', value: `\`\`\`Total Detected: ${stats.totalTokensDetected || 0}\`\`\``, inline: true },
        { name: 'RAIDS', value: `\`\`\`Raids Stopped: ${stats.totalRaidsStopped || 0}\`\`\``, inline: true }
      );
    await message.reply({ embeds: [embed] });
    return;
  }
  if (cmd === 'logs') {
    const logs = load(db.logs);
    const guildLogs = logs[guildId] || [];
    const recent = guildLogs.slice(-10).reverse();
    let logText = '';
    for (const log of recent) {
      logText += `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.critical ? '⚠️' : '📋'} ${log.title}\n`;
    }
    await message.reply('```\nRECENT LOGS\n═══════════════════════════════════\n' + (logText || 'NO LOGS AVAILABLE') + '\n═══════════════════════════════════\nPROTECTED BY NRT (DOWN 4 NRT)\n```');
    return;
  }
  if (cmd === 'spamtest') {
    await sendProtectionMessage(message.channel, message.author, 'SPAM KICK (TEST)');
    await message.reply('```\nSPAM PROTECTION TEST COMPLETE\nPROTECTED BY NRT (DOWN 4 NRT)\n```');
    return;
  }

  await message.reply(`\`\`\`\nUnknown command: !${cmd}\nType !help for available commands\nPROTECTED BY NRT (DOWN 4 NRT)\n\`\`\``);
});

// ============================================================
// ANTI-BOT: UNAUTHORIZED BOT DETECTION (unchanged except strings)
// ============================================================
client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.user.bot) return;
  
  const cfg = getConfig(member.guild.id);
  if (!cfg.antibot) return;
  
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.BotAdd);
  if (!executor || isBypassed(member.guild.id, executor.id)) return;
  
  console.log(`[BOT] UNAUTHORIZED BOT: ${member.user.tag} added by ${executor.tag}`);
  
  try {
    await member.kick('UNAUTHORIZED BOT - PROTECTED BY NRT (DOWN 4 NRT)');
  } catch (err) {
    console.error('[BOT] REMOVE_ERROR:', err.message);
  }
  
  const channel = member.guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .first();
  
  try {
    const adminMember = await member.guild.members.fetch(executor.id);
    await adminMember.ban({ reason: 'UNAUTHORIZED BOT ADDITION - PROTECTED BY NRT (DOWN 4 NRT)' });
    if (channel) {
      await sendProtectionMessage(channel, executor, 'UNAUTHORIZED BOT BAN');
    }
    await sendLog(member.guild, 'UNAUTHORIZED BOT BLOCKED', 'Admin banned for adding unauthorized bot', [
      { name: 'BOT', value: member.user.tag, inline: true },
      { name: 'ADDED BY', value: `<@${executor.id}> (${executor.tag})`, inline: true },
      { name: 'ACTION', value: 'ADMIN BANNED - BOT REMOVED', inline: true },
      { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
    ], 0xff0000, true);
  } catch (err) {
    console.error('[BOT] BAN_ERROR:', err.message);
  }
});

// ============================================================
// ANTI-RAID: MASS JOIN (unchanged)
// ============================================================
const joinTracker = new Map();

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  
  const cfg = getConfig(member.guild.id);
  if (!cfg.antiraid || cfg.panicMode) return;
  
  const now = Date.now();
  const guildId = member.guild.id;
  
  if (!joinTracker.has(guildId)) joinTracker.set(guildId, []);
  const list = joinTracker.get(guildId).concat(now).filter(t => now - t < cfg.raidWindow);
  joinTracker.set(guildId, list);
  
  if (list.length >= cfg.raidThreshold) {
    joinTracker.set(guildId, []);
    const stats = load(db.stats);
    stats.totalRaidsStopped = (stats.totalRaidsStopped || 0) + 1;
    save(db.stats, stats);
    if (cfg.autoLockdown) {
      try {
        member.guild.channels.cache
          .filter(c => c.type === ChannelType.GuildText)
          .forEach(c => c.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {}));
        await member.guild.edit({ verificationLevel: 4 }).catch(() => {});
      } catch (err) {
        console.error('[NRT] LOCKDOWN_ERROR:', err.message);
      }
    }
    await sendLog(member.guild, 'RAID DETECTED & STOPPED', `Raid attempt with ${list.length} joins`, [
      { name: 'JOINS', value: `${list.length}`, inline: true },
      { name: 'ACTION', value: 'LOCKDOWN ACTIVATED', inline: true },
      { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
    ], 0xff0000, true);
    setTimeout(() => {
      try {
        member.guild.channels.cache
          .filter(c => c.type === ChannelType.GuildText)
          .forEach(c => c.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null }).catch(() => {}));
        member.guild.edit({ verificationLevel: 1 }).catch(() => {});
        sendLog(member.guild, 'LOCKDOWN LIFTED', 'Raid lockdown automatically lifted', [
          { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
        ], 0x00ff44);
      } catch (err) {
        console.error('[NRT] UNLOCK_ERROR:', err.message);
      }
    }, cfg.lockdownDuration);
  }
  
  // Account age check
  const age = Date.now() - member.user.createdTimestamp;
  const minAge = cfg.minAccountAge * 24 * 60 * 60 * 1000;
  if (age < minAge && !isBypassed(member.guild.id, member.id)) {
    try {
      await member.ban({ reason: `RAID PROTECTION: Account age ${Math.floor(age / 86400000)} days` });
      await sendLog(member.guild, 'RAID PROTECTION', 'New account blocked', [
        { name: 'USER', value: member.user.tag, inline: true },
        { name: 'AGE', value: `${Math.floor(age / 86400000)} days`, inline: true },
        { name: 'ACTION', value: 'BANNED', inline: true },
        { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
      ], 0xff6600, true);
    } catch (err) {
      console.error('[NRT] BAN_ERROR:', err.message);
    }
  }
});

// ============================================================
// ANTI-NUKE: CHANNEL DELETE (unchanged)
// ============================================================
client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.antinuke || cfg.panicMode) return;

  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!executor || executor.id === client.user.id || isBypassed(channel.guild.id, executor.id)) return;

  const count = trackAction(executor.id, 'channelDelete', channel.guild.id);
  if (count >= 3) {
    await smartPunish(channel.guild, executor.id, 10, 'MASS_CHANNEL_DELETION', true);
    await sendLog(channel.guild, 'NUKE ATTEMPT BLOCKED', 'Mass channel deletion detected', [
      { name: 'ATTACKER', value: `<@${executor.id}>`, inline: true },
      { name: 'CHANNELS DELETED', value: `${count}`, inline: true },
      { name: 'ACTION', value: 'USER BANNED', inline: true },
      { name: 'PROTECTED BY', value: 'NRT (DOWN 4 NRT)', inline: true }
    ], 0xff0000, true);
  }
});

// ============================================================
// UNHANDLED REJECTION HANDLER
// ============================================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('[NRT] UNHANDLED_REJECTION:', reason);
});

// ============================================================
// LOGIN
// ============================================================
console.log('[NRT] ========================================');
console.log('[NRT] CHECKING ENVIRONMENT...');
console.log(`[NRT] BOT_TOKEN: ${process.env.BOT_TOKEN ? 'SET' : 'MISSING'}`);
console.log(`[NRT] OWNER_ID: ${process.env.OWNER_ID || 'MISSING'}`);
console.log(`[NRT] HOST: RAILWAY`);
console.log('[NRT] ========================================');

if (!process.env.BOT_TOKEN) {
  console.error('[NRT] FATAL: BOT_TOKEN environment variable is missing');
  process.exit(1);
}

if (!process.env.OWNER_ID) {
  console.error('[NRT] FATAL: OWNER_ID environment variable is missing');
  process.exit(1);
}

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('[NRT] LOGIN_FAILED:', err.message);
  process.exit(1);
});
