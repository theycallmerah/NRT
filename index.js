const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
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

// ---------- CONFIG ----------
const TOKEN = process.env.DISCORD_TOKEN;
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const GUILD_ID = process.env.GUILD_ID;
const TICKET_IMAGE_URL = process.env.TICKET_IMAGE_URL || '';

const TICKET_TYPES = {
    Support: 'General help and questions',
    Report: 'Report a user or issue',
    Other: 'Anything else',
};

// ---------- CLIENT READY ----------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('ticket').setDescription('Deploy the ticket creation panel'),
        new SlashCommandBuilder().setName('setupverify').setDescription('Send the verification button to the verify channel'),
        new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
        new SlashCommandBuilder().setName('close').setDescription('Close the current ticket channel'),
        new SlashCommandBuilder().setName('delete').setDescription('Permanently delete the ticket channel'),
        new SlashCommandBuilder()
            .setName('add')
            .setDescription('Add a user to the ticket')
            .addUserOption(option => option.setName('user').setDescription('User to add').setRequired(true)),
        new SlashCommandBuilder()
            .setName('remove')
            .setDescription('Remove a user from the ticket')
            .addUserOption(option => option.setName('user').setDescription('User to remove').setRequired(true)),
        new SlashCommandBuilder()
            .setName('rename')
            .setDescription('Rename the ticket channel')
            .addStringOption(option => option.setName('name').setDescription('New channel name').setRequired(true)),
        new SlashCommandBuilder().setName('claim').setDescription('Claim this ticket'),
        new SlashCommandBuilder().setName('unclaim').setDescription('Unclaim this ticket'),
        new SlashCommandBuilder().setName('list').setDescription('List all open tickets'),
    ];

    try {
        await client.rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
        console.log('Slash commands registered for guild');
    } catch (e) {
        console.error('Error registering commands:', e);
    }
});

// ---------- WELCOME ----------
client.on('guildMemberAdd', async (member) => {
    const channel = client.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setTitle('Welcome')
        .setDescription(`Welcome to the server, ${member}! Please verify yourself in the verification channel.`)
        .setColor(0xFFD700);
    await channel.send({ embeds: [embed] });
});

// ---------- MODALS ----------
class VerifyModal extends ModalBuilder {
    constructor() {
        super()
            .setCustomId('verifyModal')
            .setTitle('Verification');
        const nameInput = new TextInputBuilder()
            .setCustomId('fullName')
            .setLabel('Full Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for verification')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        const extraInput = new TextInputBuilder()
            .setCustomId('extra')
            .setLabel('Extra info (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);
        this.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(reasonInput),
            new ActionRowBuilder().addComponents(extraInput)
        );
    }
}

class TicketModal extends ModalBuilder {
    constructor(ticketType) {
        super()
            .setCustomId(`ticketModal_${ticketType}`)
            .setTitle('Create Ticket');
        this.ticketType = ticketType;
        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for ticket')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        this.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    }
}

// ---------- INTERACTION HANDLING ----------
client.on('interactionCreate', async (interaction) => {
    // ---------- MODAL SUBMISSIONS ----------
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
            const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send({ embeds: [embed] });
            await interaction.reply({ content: 'Your information has been submitted.', ephemeral: true });
            return;
        }

        if (interaction.customId.startsWith('ticketModal_')) {
            const ticketType = interaction.customId.replace('ticketModal_', '');
            const reason = interaction.fields.getTextInputValue('reason');
            const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
            if (!category) {
                await interaction.reply({ content: 'Ticket category not found.', ephemeral: true });
                return;
            }
            const ticketCount = category.children.cache.filter(ch => ch.name.startsWith('ticket-')).size + 1;
            const name = `ticket-${ticketType.toLowerCase()}-${ticketCount}`;
            const overwrites = [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ];
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

    // ---------- BUTTONS (from panels) ----------
    if (interaction.isButton()) {
        if (interaction.customId === 'verifyButton') {
            const modal = new VerifyModal();
            await interaction.showModal(modal);
            return;
        }
        // Ticket type buttons
        if (interaction.customId.startsWith('ticket_')) {
            const type = interaction.customId.replace('ticket_', '');
            const modal = new TicketModal(type);
            await interaction.showModal(modal);
            return;
        }
    }

    // ---------- SLASH COMMANDS ----------
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // ----- /help -----
        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('NRT BOT Commands')
                .setDescription('List of all slash commands:')
                .addFields(
                    { name: 'Ticket Panel', value: '/ticket - Deploy the ticket creation panel' },
                    { name: 'Verification', value: '/setupverify - Send the verification button to the designated channel' },
                    { name: 'Ticket Management', value: '/close - Close current ticket\n/delete - Delete current ticket\n/add <user> - Add user\n/remove <user> - Remove user\n/rename <name> - Rename ticket\n/claim - Claim ticket\n/unclaim - Unclaim ticket\n/list - List all open tickets' },
                    { name: 'Other', value: '/help - Show this message' }
                )
                .setColor(0x00AAFF)
                .setFooter({ text: 'All commands are text-only, no emojis.' });
            await interaction.reply({ embeds: [embed] });
            return;
        }

        // ----- /ticket (panel) -----
        if (commandName === 'ticket') {
            const embed = new EmbedBuilder()
                .setTitle('Create a Ticket')
                .setDescription('Choose a ticket type below:')
                .setColor(0x5865F2);
            if (TICKET_IMAGE_URL) embed.setImage(TICKET_IMAGE_URL);
            const row = new ActionRowBuilder();
            for (const [label, desc] of Object.entries(TICKET_TYPES)) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_${label}`)
                        .setLabel(label)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            await interaction.reply({ embeds: [embed], components: [row] });
            return;
        }

        // ----- /setupverify -----
        if (commandName === 'setupverify') {
            if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({ content: 'You need administrator permissions.', ephemeral: true });
                return;
            }
            const channel = client.channels.cache.get(VERIFY_CHANNEL_ID);
            if (!channel) {
                await interaction.reply({ content: 'Verify channel not found. Check .env', ephemeral: true });
                return;
            }
            const embed = new EmbedBuilder()
                .setTitle('Verification Required')
                .setDescription('Click the button below to verify your identity.')
                .setColor(0xFFD700);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verifyButton')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );
            await channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `Verification panel sent to ${channel}`, ephemeral: true });
            return;
        }

        // ----- TICKET MANAGEMENT COMMANDS (must be inside a ticket channel) -----
        const isTicket = interaction.channel.name.startsWith('ticket-');
        if (!isTicket && ['close','delete','add','remove','rename','claim','unclaim'].includes(commandName)) {
            await interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
            return;
        }

        // /close
        if (commandName === 'close') {
            const embed = new EmbedBuilder()
                .setTitle('Ticket Closed')
                .setDescription('This ticket has been closed by staff.')
                .setColor(0xFF0000);
            await interaction.reply({ embeds: [embed] });
            await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
            return;
        }

        // /delete
        if (commandName === 'delete') {
            await interaction.reply({ content: 'Deleting this ticket...' });
            await interaction.channel.delete();
            return;
        }

        // /add
        if (commandName === 'add') {
            const user = interaction.options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            await interaction.reply({ content: `${user} added to the ticket.` });
            return;
        }

        // /remove
        if (commandName === 'remove') {
            const user = interaction.options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
            await interaction.reply({ content: `${user} removed from the ticket.` });
            return;
        }

        // /rename
        if (commandName === 'rename') {
            const newName = interaction.options.getString('name');
            await interaction.channel.setName(newName);
            await interaction.reply({ content: `Ticket renamed to ${newName}` });
            return;
        }

        // /claim
        if (commandName === 'claim') {
            const embed = new EmbedBuilder()
                .setTitle('Ticket Claimed')
                .setDescription(`${interaction.user} has claimed this ticket.`)
                .setColor(0x00FF00);
            await interaction.reply({ embeds: [embed] });
            return;
        }

        // /unclaim
        if (commandName === 'unclaim') {
            const embed = new EmbedBuilder()
                .setTitle('Ticket Unclaimed')
                .setDescription(`${interaction.user} has unclaimed this ticket.`)
                .setColor(0xFFA500);
            await interaction.reply({ embeds: [embed] });
            return;
        }

        // /list
        if (commandName === 'list') {
            const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
            if (!category) {
                await interaction.reply({ content: 'Category not found.', ephemeral: true });
                return;
            }
            const tickets = category.children.cache.filter(ch => ch.name.startsWith('ticket-'));
            if (tickets.size === 0) {
                await interaction.reply({ content: 'No open tickets.' });
                return;
            }
            const list = tickets.map(ch => `${ch} - ${ch.name}`).join('\n');
            const embed = new EmbedBuilder()
                .setTitle('Open Tickets')
                .setDescription(list)
                .setColor(0x00AAFF);
            await interaction.reply({ embeds: [embed] });
            return;
        }
    }
});

// ---------- LOGIN ----------
client.login(TOKEN);
