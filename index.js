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
    return settings.ticketTypes || [
        { label: 'Support', value: 'support' },
        { label: 'Report', value: 'report' },
        { label: 'Other', value: 'other' }
    ];
}

// ---------- CONFIG FROM ENV (fallback) ----------
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

    // Register all commands
    const commands = [
        new SlashCommandBuilder().setName('help').setDescription('Show all commands'),

        // Configuration commands (admin only)
        new SlashCommandBuilder().setName('setpanelchannel').setDescription('Set the channel where the ticket panel will be sent').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
        new SlashCommandBuilder().setName('setticketimage').setDescription('Set image URL for the ticket panel').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)),
        new SlashCommandBuilder().setName('addtickettype').setDescription('Add a ticket type button').addStringOption(opt => opt.setName('label').setDescription('Button label').setRequired(true)).addStringOption(opt => opt.setName('description').setDescription('Description (optional)').setRequired(false)),
        new SlashCommandBuilder().setName('removetickettype').setDescription('Remove a ticket type').addStringOption(opt => opt.setName('label').setDescription('Label to remove').setRequired(true)),
        new SlashCommandBuilder().setName('setverifychannel').setDescription('Set channel for verification button').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
        new SlashCommandBuilder().setName('setverifyrole').setDescription('Set role to assign on verification').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)),
        new SlashCommandBuilder().setName('setwelcomechannel').setDescription('Set channel for welcome messages').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
        new SlashCommandBuilder().setName('setwelcomemessage').setDescription('Set welcome message (use {user}, {guild})').addStringOption(opt => opt.setName('message').setDescription('Message').setRequired(true)),
        new SlashCommandBuilder().setName('setlogchannel').setDescription('Set channel for verification logs').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
        new SlashCommandBuilder().setName('setpurchaselog').setDescription('Set channel for purchase logs').addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(true)),
        new SlashCommandBuilder().setName('setcategory').setDescription('Set category for ticket channels').addChannelOption(opt => opt.setName('category').setDescription('Category').setRequired(true)),

        // Ticket deployment
        new SlashCommandBuilder().setName('ticket').setDescription('Send the ticket panel to the configured channel'),

        // Verification setup (sends the button)
        new SlashCommandBuilder().setName('setupverify').setDescription('Send the verification button to the verify channel'),

        // Purchase logging
        new SlashCommandBuilder()
            .setName('bought')
            .setDescription('Log a purchase with proof')
            .addStringOption(opt => opt.setName('item').setDescription('Item purchased').setRequired(true))
            .addNumberOption(opt => opt.setName('amount').setDescription('Amount paid').setRequired(true))
            .addAttachmentOption(opt => opt.setName('proof').setDescription('Proof attachment (image/file)').setRequired(false)),

        // Ticket management commands (only in ticket channels)
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

    // Deploy ticket panel to configured channel if set
    const settings = getGuildSettings(GUILD_ID);
    if (settings.panelChannelId) {
        const channel = guild.channels.cache.get(settings.panelChannelId);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle('Create a Ticket')
                .setDescription('Click a button below to open a ticket.')
                .setColor(0x5865F2);
            if (settings.ticketImageUrl) embed.setImage(settings.ticketImageUrl);
            const row = new ActionRowBuilder();
            const types = getTicketTypes(GUILD_ID);
            for (const t of types) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_${t.value}`)
                        .setLabel(t.label)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
            console.log('Ticket panel sent to configured channel.');
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
    const msgTemplate = settings.welcomeMessage || 'Welcome {user} to {guild}!';
    const msg = msgTemplate.replace(/{user}/g, member.toString()).replace(/{guild}/g, guild.name);
    await channel.send(msg);
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
        if (interaction.customId === 'verifyModal') {
            const fullName = interaction.fields.getTextInputValue('fullName');
            const reason = interaction.fields.getTextInputValue('reason');
            const extra = interaction.fields.getTextInputValue('extra') || 'None';
            const embed = new EmbedBuilder()
                .setTitle('New Verification')
                .setColor(0x00FF00)
                .setDescription(`User: ${interaction.user}\nID: ${interaction.user.id}`)
                .addFields(
                    { name: 'Full Name', value: fullName },
                    { name: 'Reason', value: reason },
                    { name: 'Extra', value: extra }
                )
                .setTimestamp();
            const settings = getGuildSettings(interaction.guild.id);
            const logChannel = interaction.guild.channels.cache.get(settings.logChannelId);
            if (logChannel) await logChannel.send({ embeds: [embed] });
            
            // Assign role if set
            if (settings.verifyRoleId) {
                const role = interaction.guild.roles.cache.get(settings.verifyRoleId);
                if (role) {
                    await interaction.member.roles.add(role).catch(() => {});
                }
            }
            await interaction.reply({ content: 'Your information has been submitted and you have been verified.', ephemeral: true });
            return;
        }

        if (interaction.customId.startsWith('ticketModal_')) {
            const ticketType = interaction.customId.replace('ticketModal_', '');
            const reason = interaction.fields.getTextInputValue('reason');
            const settings = getGuildSettings(interaction.guild.id);
            const category = interaction.guild.channels.cache.get(settings.ticketCategoryId);
            if (!category) {
                await interaction.reply({ content: 'Ticket category not set. Ask admin to use /setcategory.', ephemeral: true });
                return;
            }
            const ticketCount = category.children.cache.filter(ch => ch.name.startsWith('ticket-')).size + 1;
            const name = `ticket-${ticketType}-${ticketCount}`;
            const overwrites = [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ];
            // If staff role set, add it
            if (settings.staffRoleId) {
                overwrites.push({ id: settings.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
            }
            const channel = await category.children.create({ name, type: ChannelType.GuildText, permissionOverwrites: overwrites });
            const embed = new EmbedBuilder()
                .setTitle(`Ticket: ${ticketType}`)
                .setDescription(`Created by ${interaction.user}\nReason: ${reason}`)
                .setColor(0x5865F2)
                .setFooter({ text: 'Use /close to close this ticket' });
            await channel.send({ content: `${interaction.user}`, embeds: [embed] });
            await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
            return;
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'verifyButton') {
            await interaction.showModal(new VerifyModal());
            return;
        }
        if (interaction.customId.startsWith('ticket_')) {
            const type = interaction.customId.replace('ticket_', '');
            await interaction.showModal(new TicketModal(type));
            return;
        }
    }

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const settings = getGuildSettings(interaction.guild.id);

        // ----- HELP -----
        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('NRT BOT Commands')
                .setDescription('All commands (admin commands require Administrator)')
                .addFields(
                    { name: 'Ticket Panel', value: '/ticket - Send the ticket panel to the configured channel' },
                    { name: 'Verification', value: '/setupverify - Send verification button to verify channel' },
                    { name: 'Ticket Management', value: '/close /delete /add /remove /rename /claim /unclaim /list' },
                    { name: 'Purchase Log', value: '/bought <item> <amount> [proof] - Log a purchase' },
                    { name: 'Configuration (Admin)', value: '/setpanelchannel /setticketimage /addtickettype /removetickettype /setverifychannel /setverifyrole /setwelcomechannel /setwelcomemessage /setlogchannel /setpurchaselog /setcategory' }
                )
                .setColor(0x00AAFF)
                .setFooter({ text: 'All commands are text-only.' });
            await interaction.reply({ embeds: [embed] });
            return;
        }

        // ----- CONFIGURATION (Admin only) -----
        const isAdmin = interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
        const configCmds = ['setpanelchannel','setticketimage','addtickettype','removetickettype','setverifychannel','setverifyrole','setwelcomechannel','setwelcomemessage','setlogchannel','setpurchaselog','setcategory'];
        if (configCmds.includes(commandName) && !isAdmin) {
            await interaction.reply({ content: 'You need Administrator permission.', ephemeral: true });
            return;
        }

        if (commandName === 'setpanelchannel') {
            const channel = interaction.options.getChannel('channel');
            setGuildSetting(interaction.guild.id, 'panelChannelId', channel.id);
            await interaction.reply({ content: `Ticket panel channel set to ${channel}.`, ephemeral: true });
            return;
        }
        if (commandName === 'setticketimage') {
            const url = interaction.options.getString('url');
            setGuildSetting(interaction.guild.id, 'ticketImageUrl', url);
            await interaction.reply({ content: 'Ticket image updated.', ephemeral: true });
            return;
        }
        if (commandName === 'addtickettype') {
            const label = interaction.options.getString('label');
            const desc = interaction.options.getString('description') || label;
            let types = getTicketTypes(interaction.guild.id);
            if (types.some(t => t.label === label)) {
                await interaction.reply({ content: 'Label already exists.', ephemeral: true });
                return;
            }
            types.push({ label, value: label.toLowerCase().replace(/\s/g,'_') });
            setGuildSetting(interaction.guild.id, 'ticketTypes', types);
            await interaction.reply({ content: `Ticket type "${label}" added.`, ephemeral: true });
            return;
        }
        if (commandName === 'removetickettype') {
            const label = interaction.options.getString('label');
            let types = getTicketTypes(interaction.guild.id);
            const filtered = types.filter(t => t.label !== label);
            if (filtered.length === types.length) {
                await interaction.reply({ content: 'Label not found.', ephemeral: true });
                return;
            }
            setGuildSetting(interaction.guild.id, 'ticketTypes', filtered);
            await interaction.reply({ content: `Ticket type "${label}" removed.`, ephemeral: true });
            return;
        }
        if (commandName === 'setverifychannel') {
            const channel = interaction.options.getChannel('channel');
            setGuildSetting(interaction.guild.id, 'verifyChannelId', channel.id);
            await interaction.reply({ content: `Verification channel set to ${channel}.`, ephemeral: true });
            return;
        }
        if (commandName === 'setverifyrole') {
            const role = interaction.options.getRole('role');
            setGuildSetting(interaction.guild.id, 'verifyRoleId', role.id);
            await interaction.reply({ content: `Verification role set to ${role.name}.`, ephemeral: true });
            return;
        }
        if (commandName === 'setwelcomechannel') {
            const channel = interaction.options.getChannel('channel');
            setGuildSetting(interaction.guild.id, 'welcomeChannelId', channel.id);
            await interaction.reply({ content: `Welcome channel set to ${channel}.`, ephemeral: true });
            return;
        }
        if (commandName === 'setwelcomemessage') {
            const msg = interaction.options.getString('message');
            setGuildSetting(interaction.guild.id, 'welcomeMessage', msg);
            await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
            return;
        }
        if (commandName === 'setlogchannel') {
            const channel = interaction.options.getChannel('channel');
            setGuildSetting(interaction.guild.id, 'logChannelId', channel.id);
            await interaction.reply({ content: `Log channel set to ${channel}.`, ephemeral: true });
            return;
        }
        if (commandName === 'setpurchaselog') {
            const channel = interaction.options.getChannel('channel');
            setGuildSetting(interaction.guild.id, 'purchaseLogChannelId', channel.id);
            await interaction.reply({ content: `Purchase log channel set to ${channel}.`, ephemeral: true });
            return;
        }
        if (commandName === 'setcategory') {
            const category = interaction.options.getChannel('category');
            if (category.type !== ChannelType.GuildCategory) {
                await interaction.reply({ content: 'Please select a category.', ephemeral: true });
                return;
            }
            setGuildSetting(interaction.guild.id, 'ticketCategoryId', category.id);
            await interaction.reply({ content: `Ticket category set to ${category.name}.`, ephemeral: true });
            return;
        }

        // ----- TICKET PANEL DEPLOYMENT -----
        if (commandName === 'ticket') {
            if (!settings.panelChannelId) {
                await interaction.reply({ content: 'Panel channel not set. Use /setpanelchannel first.', ephemeral: true });
                return;
            }
            const channel = interaction.guild.channels.cache.get(settings.panelChannelId);
            if (!channel) {
                await interaction.reply({ content: 'Channel not found.', ephemeral: true });
                return;
            }
            const embed = new EmbedBuilder()
                .setTitle('Create a Ticket')
                .setDescription('Choose a ticket type:')
                .setColor(0x5865F2);
            if (settings.ticketImageUrl) embed.setImage(settings.ticketImageUrl);
            const row = new ActionRowBuilder();
            const types = getTicketTypes(interaction.guild.id);
            for (const t of types) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_${t.value}`)
                        .setLabel(t.label)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            await channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `Ticket panel sent to ${channel}.`, ephemeral: true });
            return;
        }

        // ----- SETUP VERIFICATION -----
        if (commandName === 'setupverify') {
            if (!settings.verifyChannelId) {
                await interaction.reply({ content: 'Verify channel not set. Use /setverifychannel first.', ephemeral: true });
                return;
            }
            const channel = interaction.guild.channels.cache.get(settings.verifyChannelId);
            if (!channel) {
                await interaction.reply({ content: 'Verify channel not found.', ephemeral: true });
                return;
            }
            const embed = new EmbedBuilder()
                .setTitle('Verification Required')
                .setDescription('Click the button below to verify.')
                .setColor(0xFFD700);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verifyButton')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );
            await channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `Verification button sent to ${channel}.`, ephemeral: true });
            return;
        }

        // ----- PURCHASE LOGGING -----
        if (commandName === 'bought') {
            const item = interaction.options.getString('item');
            const amount = interaction.options.getNumber('amount');
            const proof = interaction.options.getAttachment('proof');
            const embed = new EmbedBuilder()
                .setTitle('Purchase Log')
                .setColor(0x00AAFF)
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
                await interaction.reply({ content: 'Purchase log channel not set. Use /setpurchaselog first.', ephemeral: true });
                return;
            }
            await logChannel.send({ embeds: [embed] });
            await interaction.reply({ content: 'Purchase logged successfully.', ephemeral: true });
            return;
        }

        // ----- TICKET MANAGEMENT (inside ticket channels) -----
        const isTicket = interaction.channel.name.startsWith('ticket-');
        if (!isTicket && ['close','delete','add','remove','rename','claim','unclaim'].includes(commandName)) {
            await interaction.reply({ content: 'This command only works in ticket channels.', ephemeral: true });
            return;
        }

        if (commandName === 'close') {
            const embed = new EmbedBuilder().setTitle('Ticket Closed').setDescription('This ticket has been closed.').setColor(0xFF0000);
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
            const user = interaction.options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            await interaction.reply({ content: `${user} added.` });
            return;
        }
        if (commandName === 'remove') {
            const user = interaction.options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
            await interaction.reply({ content: `${user} removed.` });
            return;
        }
        if (commandName === 'rename') {
            const newName = interaction.options.getString('name');
            await interaction.channel.setName(newName);
            await interaction.reply({ content: `Renamed to ${newName}` });
            return;
        }
        if (commandName === 'claim') {
            const embed = new EmbedBuilder().setTitle('Ticket Claimed').setDescription(`${interaction.user} claimed this ticket.`).setColor(0x00FF00);
            await interaction.reply({ embeds: [embed] });
            return;
        }
        if (commandName === 'unclaim') {
            const embed = new EmbedBuilder().setTitle('Ticket Unclaimed').setDescription(`${interaction.user} unclaimed this ticket.`).setColor(0xFFA500);
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
            const embed = new EmbedBuilder().setTitle('Open Tickets').setDescription(list).setColor(0x00AAFF);
            await interaction.reply({ embeds: [embed] });
            return;
        }
    }
});

client.login(TOKEN);
