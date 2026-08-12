const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel]
});

// ---------- SETTINGS ----------
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

function loadSettings() {
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        } catch { return {}; }
    }
    return {};
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getGuildSettings(guildId) {
    const all = loadSettings();
    if (!all[guildId]) all[guildId] = {};
    return all[guildId];
}

function setGuildSetting(guildId, key, value) {
    const all = loadSettings();
    if (!all[guildId]) all[guildId] = {};
    all[guildId][key] = value;
    saveSettings(all);
}

function getTicketTypes(guildId) {
    const settings = getGuildSettings(guildId);
    return settings.ticketTypes || [];
}

// Default rules if not set
const DEFAULT_RULES = `Read the server rules first.
Don't cause drama or start fights.
No spamming or annoying people.
Don't send suspicious links or scams.
Don't pretend to be someone else.
No advertising unless it's allowed.
Respect the staff and other members.
Follow Discord's rules.
Don't try to bypass the verification system.

By verifying, you agree to follow the rules. If you break them, you may be warned, kicked, or banned.`;

// ---------- CONFIG FROM ENV ----------
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// ---------- CLIENT READY ----------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error('Guild not found. Check GUILD_ID env.');
        return;
    }

    // Build command tree with subcommand groups
    const commands = [
        // Help
        new SlashCommandBuilder().setName('help').setDescription('Show all commands'),

        // Ticket group
        new SlashCommandBuilder()
            .setName('ticket')
            .setDescription('Manage the ticket system')
            .addSubcommand(sub => sub.setName('panel').setDescription('Send the ticket panel to the current channel'))
            .addSubcommand(sub => sub.setName('channel').setDescription('Set the default channel for the ticket panel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
            .addSubcommand(sub => sub.setName('image').setDescription('Set image URL for the ticket panel').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)))
            .addSubcommand(sub => sub.setName('addtype').setDescription('Add a ticket type').addStringOption(opt => opt.setName('label').setDescription('Label').setRequired(true)))
            .addSubcommand(sub => sub.setName('removetype').setDescription('Remove a ticket type').addStringOption(opt => opt.setName('label').setDescription('Label').setRequired(true)))
            .addSubcommand(sub => sub.setName('category').setDescription('Set the category for ticket channels').addChannelOption(opt => opt.setName('category').setDescription('Category').setRequired(true))),

        // Verify group
        new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Manage the verification system')
            .addSubcommand(sub => sub.setName('setup').setDescription('Send the verification button to the current channel'))
            .addSubcommand(sub => sub.setName('channel').setDescription('Set the default channel for the verification button').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
            .addSubcommand(sub => sub.setName('log').setDescription('Set the log channel for verification data').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
            .addSubcommand(sub => sub.setName('role').setDescription('Set the role to assign on verification').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)))
            .addSubcommand(sub => sub.setName('rules').setDescription('Set the rules text shown before verification').addStringOption(opt => opt.setName('text').setDescription('Rules').setRequired(true))),

        // Welcome group
        new SlashCommandBuilder()
            .setName('welcome')
            .setDescription('Manage the welcome system')
            .addSubcommand(sub => sub.setName('channel').setDescription('Set the welcome channel').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)))
            .addSubcommand(sub => sub.setName('message').setDescription('Set the welcome message (use {user}, {guild})').addStringOption(opt => opt.setName('text').setDescription('Message').setRequired(true)))
            .addSubcommand(sub => sub.setName('image').setDescription('Set an image for the welcome embed').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)))
            .addSubcommand(sub => sub.setName('test').setDescription('Send a test welcome message')),

        // Purchase log channel setting (admin)
        new SlashCommandBuilder()
            .setName('setpurchaselog')
            .setDescription('Set the channel for purchase logs')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),

        // Purchase command
        new SlashCommandBuilder()
            .setName('bought')
            .setDescription('Log a purchase with proof')
            .addStringOption(opt => opt.setName('item').setDescription('Item purchased').setRequired(true))
            .addNumberOption(opt => opt.setName('amount').setDescription('Amount paid').setRequired(true))
            .addAttachmentOption(opt => opt.setName('proof').setDescription('Proof attachment').setRequired(false)),

        // Ticket management (standalone)
        new SlashCommandBuilder().setName('close').setDescription('Close current ticket'),
        new SlashCommandBuilder().setName('delete').setDescription('Delete current ticket'),
        new SlashCommandBuilder().setName('add').setDescription('Add user to ticket').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
        new SlashCommandBuilder().setName('remove').setDescription('Remove user from ticket').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
        new SlashCommandBuilder().setName('rename').setDescription('Rename ticket').addStringOption(opt => opt.setName('name').setDescription('New name').setRequired(true)),
        new SlashCommandBuilder().setName('claim').setDescription('Claim ticket'),
        new SlashCommandBuilder().setName('unclaim').setDescription('Unclaim ticket'),
        new SlashCommandBuilder().setName('list').setDescription('List all open tickets'),
    ];

    try {
        await client.rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
        console.log('Slash commands registered.');
    } catch (e) {
        console.error('Command registration error:', e);
    }

    // Auto-deploy ticket panel if channel is set
    const settings = getGuildSettings(GUILD_ID);
    if (settings.ticketChannelId) {
        const channel = guild.channels.cache.get(settings.ticketChannelId);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle('Create a Ticket')
                .setDescription('Choose a ticket type below.')
                .setColor(0x1a1a1a)
                .setFooter({ text: 'NRT BOT', iconURL: client.user.displayAvatarURL() });
            if (settings.ticketImageUrl) embed.setImage(settings.ticketImageUrl);
            const row = new ActionRowBuilder();
            const types = getTicketTypes(GUILD_ID);
            if (types.length === 0) {
                // Add default types if none
                const defaults = [
                    { label: 'Support', value: 'support' },
                    { label: 'Report', value: 'report' },
                    { label: 'Other', value: 'other' }
                ];
                setGuildSetting(GUILD_ID, 'ticketTypes', defaults);
                types.push(...defaults);
            }
            for (const t of types) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_${t.value}`)
                        .setLabel(t.label)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
            console.log('Ticket panel auto-deployed.');
        }
    }
});

// ---------- WELCOME ----------
client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;
    const settings = getGuildSettings(guild.id);
    if (!settings.welcomeChannelId) return;
    const channel = guild.channels.cache.get(settings.welcomeChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(0x1a1a1a)
        .setTitle('Welcome')
        .setDescription((settings.welcomeMessage || 'Welcome {user} to {guild}!').replace(/{user}/g, member.toString()).replace(/{guild}/g, guild.name))
        .setTimestamp();
    if (settings.welcomeImageUrl) embed.setImage(settings.welcomeImageUrl);
    await channel.send({ embeds: [embed] });
});

// ---------- MODALS ----------
class VerifyModal extends ModalBuilder {
    constructor() {
        super().setCustomId('verifyModal').setTitle('Verification');
        const nameInput = new TextInputBuilder().setCustomId('fullName').setLabel('Full Name').setStyle(TextInputStyle.Short).setRequired(true);
        const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Reason for verification').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const extraInput = new TextInputBuilder().setCustomId('extra').setLabel('Extra info (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
        this.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(reasonInput),
            new ActionRowBuilder().addComponents(extraInput)
        );
    }
}

class TicketModal extends ModalBuilder {
    constructor(ticketTypeValue) {
        super().setCustomId(`ticketModal_${ticketTypeValue}`).setTitle('Create Ticket');
        this.ticketType = ticketTypeValue;
        const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Reason for ticket').setStyle(TextInputStyle.Paragraph).setRequired(true);
        this.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    }
}

// ---------- INTERACTION HANDLING ----------
client.on('interactionCreate', async (interaction) => {
    if (interaction.isModalSubmit()) {
        // Verification modal
        if (interaction.customId === 'verifyModal') {
            const fullName = interaction.fields.getTextInputValue('fullName');
            const reason = interaction.fields.getTextInputValue('reason');
            const extra = interaction.fields.getTextInputValue('extra') || 'None';
            const embed = new EmbedBuilder()
                .setTitle('New Verification')
                .setColor(0x00ff00)
                .setDescription(`User: ${interaction.user}\nID: ${interaction.user.id}`)
                .addFields(
                    { name: 'Full Name', value: fullName },
                    { name: 'Reason', value: reason },
                    { name: 'Extra', value: extra }
                )
                .setTimestamp();
            const settings = getGuildSettings(interaction.guild.id);
            const logChannel = interaction.guild.channels.cache.get(settings.verifyLogChannelId);
            if (logChannel) await logChannel.send({ embeds: [embed] });
            // Assign role
            if (settings.verifyRoleId) {
                const role = interaction.guild.roles.cache.get(settings.verifyRoleId);
                if (role) await interaction.member.roles.add(role).catch(() => {});
            }
            await interaction.reply({ content: 'You have been verified!', ephemeral: true });
            return;
        }

        // Ticket modal
        if (interaction.customId.startsWith('ticketModal_')) {
            const ticketType = interaction.customId.replace('ticketModal_', '');
            const reason = interaction.fields.getTextInputValue('reason');
            const settings = getGuildSettings(interaction.guild.id);
            const category = interaction.guild.channels.cache.get(settings.ticketCategoryId);
            if (!category) {
                await interaction.reply({ content: 'Ticket category not set. Use /ticket category.', ephemeral: true });
                return;
            }
            const ticketCount = category.children.cache.filter(ch => ch.name.startsWith('ticket-')).size + 1;
            const name = `ticket-${ticketType}-${ticketCount}`;
            const overwrites = [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ];
            if (settings.staffRoleId) {
                overwrites.push({ id: settings.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
            }
            const channel = await category.children.create({ name, type: ChannelType.GuildText, permissionOverwrites: overwrites });
            const embed = new EmbedBuilder()
                .setTitle(`Ticket: ${ticketType}`)
                .setDescription(`Created by ${interaction.user}\nReason: ${reason}`)
                .setColor(0x1a1a1a)
                .setFooter({ text: 'Use /close to close this ticket' });
            await channel.send({ content: `${interaction.user}`, embeds: [embed] });
            await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
            return;
        }
    }

    // ---------- BUTTONS ----------
    if (interaction.isButton()) {
        // Verify button – show rules first? We'll show rules in the embed already; clicking verify opens modal.
        if (interaction.customId === 'verifyButton') {
            await interaction.showModal(new VerifyModal());
            return;
        }
        // Ticket type buttons
        if (interaction.customId.startsWith('ticket_')) {
            const type = interaction.customId.replace('ticket_', '');
            await interaction.showModal(new TicketModal(type));
            return;
        }
    }

    // ---------- SLASH COMMANDS ----------
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;
        const settings = getGuildSettings(interaction.guild.id);

        // ----- HELP -----
        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('NRT BOT Commands')
                .setColor(0x1a1a1a)
                .setDescription('All commands are organized in groups.')
                .addFields(
                    { name: '/ticket', value: 'Manage ticket system: panel, channel, image, addtype, removetype, category' },
                    { name: '/verify', value: 'Manage verification: setup, channel, log, role, rules' },
                    { name: '/welcome', value: 'Manage welcome: channel, message, image, test' },
                    { name: 'Ticket Management', value: '/close, /delete, /add, /remove, /rename, /claim, /unclaim, /list' },
                    { name: 'Purchase', value: '/bought <item> <amount> [proof]' },
                    { name: 'Admin', value: '/setpurchaselog' }
                )
                .setFooter({ text: 'Dark theme – all embeds use black background' });
            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Check admin for settings commands
        const isAdmin = interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
        const settingCmds = ['ticket', 'verify', 'welcome', 'setpurchaselog'];
        if (settingCmds.includes(commandName) && !isAdmin) {
            await interaction.reply({ content: 'You need Administrator permission.', ephemeral: true });
            return;
        }

        // ----- TICKET GROUP -----
        if (commandName === 'ticket') {
            const sub = options.getSubcommand();
            if (sub === 'panel') {
                const embed = new EmbedBuilder()
                    .setTitle('Create a Ticket')
                    .setDescription('Choose a ticket type below.')
                    .setColor(0x1a1a1a)
                    .setFooter({ text: 'NRT BOT', iconURL: client.user.displayAvatarURL() });
                if (settings.ticketImageUrl) embed.setImage(settings.ticketImageUrl);
                const row = new ActionRowBuilder();
                let types = getTicketTypes(interaction.guild.id);
                if (types.length === 0) {
                    // set defaults
                    types = [
                        { label: 'Support', value: 'support' },
                        { label: 'Report', value: 'report' },
                        { label: 'Other', value: 'other' }
                    ];
                    setGuildSetting(interaction.guild.id, 'ticketTypes', types);
                }
                for (const t of types) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ticket_${t.value}`)
                            .setLabel(t.label)
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                await interaction.channel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Ticket panel sent.', ephemeral: true });
                return;
            }
            if (sub === 'channel') {
                const channel = options.getChannel('channel');
                setGuildSetting(interaction.guild.id, 'ticketChannelId', channel.id);
                await interaction.reply({ content: `Ticket panel channel set to ${channel}.`, ephemeral: true });
                return;
            }
            if (sub === 'image') {
                const url = options.getString('url');
                setGuildSetting(interaction.guild.id, 'ticketImageUrl', url);
                await interaction.reply({ content: 'Ticket image updated.', ephemeral: true });
                return;
            }
            if (sub === 'addtype') {
                const label = options.getString('label');
                let types = getTicketTypes(interaction.guild.id);
                if (types.some(t => t.label === label)) {
                    await interaction.reply({ content: 'Type already exists.', ephemeral: true });
                    return;
                }
                types.push({ label, value: label.toLowerCase().replace(/\s+/g, '_') });
                setGuildSetting(interaction.guild.id, 'ticketTypes', types);
                await interaction.reply({ content: `Type "${label}" added.`, ephemeral: true });
                return;
            }
            if (sub === 'removetype') {
                const label = options.getString('label');
                let types = getTicketTypes(interaction.guild.id);
                const filtered = types.filter(t => t.label !== label);
                if (filtered.length === types.length) {
                    await interaction.reply({ content: 'Type not found.', ephemeral: true });
                    return;
                }
                setGuildSetting(interaction.guild.id, 'ticketTypes', filtered);
                await interaction.reply({ content: `Type "${label}" removed.`, ephemeral: true });
                return;
            }
            if (sub === 'category') {
                const category = options.getChannel('category');
                if (category.type !== ChannelType.GuildCategory) {
                    await interaction.reply({ content: 'Please select a category.', ephemeral: true });
                    return;
                }
                setGuildSetting(interaction.guild.id, 'ticketCategoryId', category.id);
                await interaction.reply({ content: `Ticket category set to ${category.name}.`, ephemeral: true });
                return;
            }
        }

        // ----- VERIFY GROUP -----
        if (commandName === 'verify') {
            const sub = options.getSubcommand();
            if (sub === 'setup') {
                // Send the verification button with rules in the embed
                const rules = settings.verifyRules || DEFAULT_RULES;
                const embed = new EmbedBuilder()
                    .setTitle('Verification')
                    .setDescription(rules)
                    .setColor(0x1a1a1a)
                    .setFooter({ text: 'Click the button below to verify.' });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verifyButton')
                        .setLabel('I Agree & Verify')
                        .setStyle(ButtonStyle.Success)
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Verification panel sent.', ephemeral: true });
                return;
            }
            if (sub === 'channel') {
                const channel = options.getChannel('channel');
                setGuildSetting(interaction.guild.id, 'verifyChannelId', channel.id);
                await interaction.reply({ content: `Verification channel set to ${channel}.`, ephemeral: true });
                return;
            }
            if (sub === 'log') {
                const channel = options.getChannel('channel');
                setGuildSetting(interaction.guild.id, 'verifyLogChannelId', channel.id);
                await interaction.reply({ content: `Verification log channel set to ${channel}.`, ephemeral: true });
                return;
            }
            if (sub === 'role') {
                const role = options.getRole('role');
                setGuildSetting(interaction.guild.id, 'verifyRoleId', role.id);
                await interaction.reply({ content: `Verification role set to ${role.name}.`, ephemeral: true });
                return;
            }
            if (sub === 'rules') {
                const text = options.getString('text');
                setGuildSetting(interaction.guild.id, 'verifyRules', text);
                await interaction.reply({ content: 'Rules updated.', ephemeral: true });
                return;
            }
        }

        // ----- WELCOME GROUP -----
        if (commandName === 'welcome') {
            const sub = options.getSubcommand();
            if (sub === 'channel') {
                const channel = options.getChannel('channel');
                setGuildSetting(interaction.guild.id, 'welcomeChannelId', channel.id);
                await interaction.reply({ content: `Welcome channel set to ${channel}.`, ephemeral: true });
                return;
            }
            if (sub === 'message') {
                const text = options.getString('text');
                setGuildSetting(interaction.guild.id, 'welcomeMessage', text);
                await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
                return;
            }
            if (sub === 'image') {
                const url = options.getString('url');
                setGuildSetting(interaction.guild.id, 'welcomeImageUrl', url);
                await interaction.reply({ content: 'Welcome image updated.', ephemeral: true });
                return;
            }
            if (sub === 'test') {
                if (!settings.welcomeChannelId) {
                    await interaction.reply({ content: 'Welcome channel not set.', ephemeral: true });
                    return;
                }
                const channel = interaction.guild.channels.cache.get(settings.welcomeChannelId);
                if (!channel) {
                    await interaction.reply({ content: 'Channel not found.', ephemeral: true });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setColor(0x1a1a1a)
                    .setTitle('Welcome')
                    .setDescription((settings.welcomeMessage || 'Welcome {user} to {guild}!').replace(/{user}/g, interaction.user.toString()).replace(/{guild}/g, interaction.guild.name))
                    .setTimestamp();
                if (settings.welcomeImageUrl) embed.setImage(settings.welcomeImageUrl);
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Test welcome sent.', ephemeral: true });
                return;
            }
        }

        // ----- SET PURCHASE LOG CHANNEL -----
        if (commandName === 'setpurchaselog') {
            const channel = options.getChannel('channel');
            setGuildSetting(interaction.guild.id, 'purchaseLogChannelId', channel.id);
            await interaction.reply({ content: `Purchase log channel set to ${channel}.`, ephemeral: true });
            return;
        }

        // ----- PURCHASE LOGGING -----
        if (commandName === 'bought') {
            const item = options.getString('item');
            const amount = options.getNumber('amount');
            const proof = options.getAttachment('proof');
            const embed = new EmbedBuilder()
                .setTitle('Purchase Log')
                .setColor(0x1a1a1a)
                .addFields(
                    { name: 'Buyer', value: `${interaction.user} (${interaction.user.id})` },
                    { name: 'Item', value: item },
                    { name: 'Amount', value: `$${amount.toFixed(2)}` }
                )
                .setTimestamp();
            if (proof) {
                embed.setImage(proof.url);
                embed.addFields({ name: 'Proof', value: proof.url });
            }
            const logChannel = interaction.guild.channels.cache.get(settings.purchaseLogChannelId);
            if (!logChannel) {
                await interaction.reply({ content: 'Purchase log channel not set. Use /setpurchaselog.', ephemeral: true });
                return;
            }
            await logChannel.send({ embeds: [embed] });
            await interaction.reply({ content: 'Purchase logged.', ephemeral: true });
            return;
        }

        // ----- TICKET MANAGEMENT COMMANDS (inside ticket channels) -----
        const isTicket = interaction.channel.name.startsWith('ticket-');
        const mgmtCmds = ['close','delete','add','remove','rename','claim','unclaim','list'];
        if (mgmtCmds.includes(commandName) && !isTicket) {
            await interaction.reply({ content: 'This command only works inside ticket channels.', ephemeral: true });
            return;
        }

        if (commandName === 'close') {
            const embed = new EmbedBuilder().setTitle('Ticket Closed').setDescription('This ticket has been closed.').setColor(0x1a1a1a);
            await interaction.reply({ embeds: [embed] });
            await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
            return;
        }
        if (commandName === 'delete') {
            await interaction.reply({ content: 'Deleting...' });
            await interaction.channel.delete();
            return;
        }
        if (commandName === 'add') {
            const user = options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            await interaction.reply({ content: `${user} added.` });
            return;
        }
        if (commandName === 'remove') {
            const user = options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
            await interaction.reply({ content: `${user} removed.` });
            return;
        }
        if (commandName === 'rename') {
            const newName = options.getString('name');
            await interaction.channel.setName(newName);
            await interaction.reply({ content: `Renamed to ${newName}` });
            return;
        }
        if (commandName === 'claim') {
            const embed = new EmbedBuilder().setTitle('Ticket Claimed').setDescription(`${interaction.user} claimed this ticket.`).setColor(0x00ff00);
            await interaction.reply({ embeds: [embed] });
            return;
        }
        if (commandName === 'unclaim') {
            const embed = new EmbedBuilder().setTitle('Ticket Unclaimed').setDescription(`${interaction.user} unclaimed this ticket.`).setColor(0xffa500);
            await interaction.reply({ embeds: [embed] });
            return;
        }
        if (commandName === 'list') {
            const category = interaction.guild.channels.cache.get(settings.ticketCategoryId);
            if (!category) {
                await interaction.reply({ content: 'Ticket category not set.', ephemeral: true });
                return;
            }
            const tickets = category.children.cache.filter(ch => ch.name.startsWith('ticket-'));
            if (tickets.size === 0) {
                await interaction.reply({ content: 'No open tickets.' });
                return;
            }
            const list = tickets.map(ch => `${ch} - ${ch.name}`).join('\n');
            const embed = new EmbedBuilder().setTitle('Open Tickets').setDescription(list).setColor(0x1a1a1a);
            await interaction.reply({ embeds: [embed] });
            return;
        }
    }
});

client.login(TOKEN);
