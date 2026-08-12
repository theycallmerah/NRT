import os
import json
import discord
from discord import app_commands, ui, Embed, Colour, ButtonStyle, Interaction, Member, User, ChannelType, Permissions
from discord.ext import commands
from dotenv import load_dotenv
from typing import Optional, Literal

load_dotenv()

# -------------------- CONFIG --------------------
TOKEN = os.getenv("DISCORD_TOKEN")
VERIFY_CHANNEL_ID = int(os.getenv("VERIFY_CHANNEL_ID", 0))
WELCOME_CHANNEL_ID = int(os.getenv("WELCOME_CHANNEL_ID", 0))
TICKET_CATEGORY_ID = int(os.getenv("TICKET_CATEGORY_ID", 0))
LOG_CHANNEL_ID = int(os.getenv("LOG_CHANNEL_ID", 0))
STAFF_ROLE_ID = int(os.getenv("STAFF_ROLE_ID", 0))
GUILD_ID = int(os.getenv("GUILD_ID", 0))
TICKET_IMAGE_URL = os.getenv("TICKET_IMAGE_URL", "")

# Ticket types
TICKET_TYPES = {
    "Support": "General help and questions",
    "Report": "Report a user or issue",
    "Other": "Anything else",
}

# -------------------- BOT SETUP --------------------
intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)
bot.remove_command("help")

# -------------------- MODALS --------------------
class VerifyModal(ui.Modal, title="Verification"):
    full_name = ui.TextInput(label="Full Name", style=discord.TextStyle.short, required=True)
    reason = ui.TextInput(label="Reason for verification", style=discord.TextStyle.paragraph, required=True)
    extra = ui.TextInput(label="Extra info (optional)", style=discord.TextStyle.paragraph, required=False)

    async def on_submit(self, interaction: Interaction):
        embed = Embed(
            title="New Verification",
            colour=Colour.green(),
            description=f"User: {interaction.user.mention}\nID: {interaction.user.id}"
        )
        embed.add_field(name="Full Name", value=self.full_name.value, inline=False)
        embed.add_field(name="Reason", value=self.reason.value, inline=False)
        if self.extra.value:
            embed.add_field(name="Extra", value=self.extra.value, inline=False)
        embed.set_footer(text="Verified at")
        embed.timestamp = discord.utils.utcnow()

        channel = bot.get_channel(LOG_CHANNEL_ID)
        if channel:
            await channel.send(embed=embed)
        await interaction.response.send_message("Your information has been submitted.", ephemeral=True)

class TicketModal(ui.Modal, title="Create Ticket"):
    reason = ui.TextInput(label="Reason for ticket", style=discord.TextStyle.paragraph, required=True)

    def __init__(self, ticket_type: str):
        super().__init__()
        self.ticket_type = ticket_type

    async def on_submit(self, interaction: Interaction):
        await interaction.response.defer(ephemeral=True)
        guild = interaction.guild
        category = guild.get_channel(TICKET_CATEGORY_ID)
        if not category:
            await interaction.followup.send("Ticket category not found.", ephemeral=True)
            return

        # Create channel
        ticket_number = len([ch for ch in category.channels if ch.name.startswith("ticket-")]) + 1
        name = f"ticket-{self.ticket_type.lower()}-{ticket_number}"
        overwrites = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
            guild.get_role(STAFF_ROLE_ID): discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)
        }
        channel = await category.create_text_channel(name, overwrites=overwrites)

        embed = Embed(
            title=f"Ticket: {self.ticket_type}",
            description=f"Created by {interaction.user.mention}\nReason: {self.reason.value}",
            colour=Colour.blurple()
        )
        embed.set_footer(text="Use /close to close this ticket")
        await channel.send(embed=embed, content=interaction.user.mention)

        await interaction.followup.send(f"Ticket created: {channel.mention}", ephemeral=True)

# -------------------- VIEWS (BUTTONS) --------------------
class TicketPanelView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        for label, desc in TICKET_TYPES.items():
            self.add_item(ui.Button(label=label, style=ButtonStyle.primary, custom_id=f"ticket_{label}"))

    @ui.button(label="Support", style=ButtonStyle.primary, custom_id="ticket_Support")
    async def support_button(self, interaction: Interaction, button: ui.Button):
        await interaction.response.send_modal(TicketModal("Support"))

    @ui.button(label="Report", style=ButtonStyle.primary, custom_id="ticket_Report")
    async def report_button(self, interaction: Interaction, button: ui.Button):
        await interaction.response.send_modal(TicketModal("Report"))

    @ui.button(label="Other", style=ButtonStyle.primary, custom_id="ticket_Other")
    async def other_button(self, interaction: Interaction, button: ui.Button):
        await interaction.response.send_modal(TicketModal("Other"))

class VerifyView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @ui.button(label="Verify", style=ButtonStyle.success, custom_id="verify_button")
    async def verify_button(self, interaction: Interaction, button: ui.Button):
        await interaction.response.send_modal(VerifyModal())

# -------------------- WELCOME --------------------
@bot.event
async def on_member_join(member: Member):
    channel = bot.get_channel(WELCOME_CHANNEL_ID)
    if channel:
        embed = Embed(
            title="Welcome",
            description=f"Welcome to the server, {member.mention}! Please verify yourself in the verification channel.",
            colour=Colour.gold()
        )
        await channel.send(embed=embed)

# -------------------- TICKET MANAGEMENT COMMANDS --------------------
class TicketManagement(app_commands.Group):
    """Ticket management commands."""

    @app_commands.command(name="close", description="Close the current ticket channel")
    async def close(self, interaction: Interaction):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        # Archive logic: send an embed, then lock channel
        embed = Embed(title="Ticket Closed", description="This ticket has been closed by staff.", colour=Colour.dark_red())
        await interaction.response.send_message(embed=embed)
        await interaction.channel.set_permissions(interaction.guild.default_role, view_channel=False)
        # Optionally delete after some time – we'll just lock.

    @app_commands.command(name="delete", description="Permanently delete the ticket channel")
    async def delete_ticket(self, interaction: Interaction):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        await interaction.response.send_message("Deleting this ticket...")
        await interaction.channel.delete()

    @app_commands.command(name="add", description="Add a user to the ticket")
    async def add_user(self, interaction: Interaction, user: User):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        await interaction.channel.set_permissions(user, view_channel=True, send_messages=True, read_message_history=True)
        await interaction.response.send_message(f"{user.mention} added to the ticket.")

    @app_commands.command(name="remove", description="Remove a user from the ticket")
    async def remove_user(self, interaction: Interaction, user: User):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        await interaction.channel.set_permissions(user, view_channel=False)
        await interaction.response.send_message(f"{user.mention} removed from the ticket.")

    @app_commands.command(name="rename", description="Rename the ticket channel")
    async def rename_ticket(self, interaction: Interaction, new_name: str):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        await interaction.channel.edit(name=new_name)
        await interaction.response.send_message(f"Ticket renamed to {new_name}")

    @app_commands.command(name="claim", description="Claim this ticket")
    async def claim_ticket(self, interaction: Interaction):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        embed = Embed(title="Ticket Claimed", description=f"{interaction.user.mention} has claimed this ticket.", colour=Colour.green())
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="unclaim", description="Unclaim this ticket")
    async def unclaim_ticket(self, interaction: Interaction):
        if not interaction.channel.name.startswith("ticket-"):
            await interaction.response.send_message("This is not a ticket channel.", ephemeral=True)
            return
        embed = Embed(title="Ticket Unclaimed", description=f"{interaction.user.mention} has unclaimed this ticket.", colour=Colour.orange())
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="list", description="List all open tickets")
    async def list_tickets(self, interaction: Interaction):
        category = interaction.guild.get_channel(TICKET_CATEGORY_ID)
        if not category:
            await interaction.response.send_message("Category not found.", ephemeral=True)
            return
        tickets = [ch for ch in category.channels if ch.name.startswith("ticket-")]
        if not tickets:
            await interaction.response.send_message("No open tickets.")
            return
        lines = "\n".join([f"{ch.mention} - {ch.name}" for ch in tickets])
        embed = Embed(title="Open Tickets", description=lines, colour=Colour.blue())
        await interaction.response.send_message(embed=embed)

# -------------------- HELP COMMAND --------------------
@bot.tree.command(name="help", description="Show all available commands")
async def help_command(interaction: Interaction):
    embed = Embed(
        title="NRT BOT Commands",
        description="List of all slash commands:",
        colour=Colour.blue()
    )
    embed.add_field(
        name="Ticket Panel",
        value="/ticket - Deploy the ticket creation panel",
        inline=False
    )
    embed.add_field(
        name="Verification",
        value="/setupverify - Send the verification button to the designated channel",
        inline=False
    )
    embed.add_field(
        name="Ticket Management",
        value=(
            "/close - Close current ticket\n"
            "/delete - Delete current ticket\n"
            "/add <user> - Add user\n"
            "/remove <user> - Remove user\n"
            "/rename <name> - Rename ticket\n"
            "/claim - Claim ticket\n"
            "/unclaim - Unclaim ticket\n"
            "/list - List all open tickets"
        ),
        inline=False
    )
    embed.add_field(
        name="Other",
        value="/help - Show this message",
        inline=False
    )
    embed.set_footer(text="All commands are text-only, no emojis.")
    await interaction.response.send_message(embed=embed)

# -------------------- SLASH COMMANDS FOR PANELS --------------------
@bot.tree.command(name="ticket", description="Create the ticket panel")
async def ticket_panel(interaction: Interaction):
    embed = Embed(
        title="Create a Ticket",
        description="Choose a ticket type below:",
        colour=Colour.blurple()
    )
    if TICKET_IMAGE_URL:
        embed.set_image(url=TICKET_IMAGE_URL)
    view = TicketPanelView()
    await interaction.response.send_message(embed=embed, view=view)

@bot.tree.command(name="setupverify", description="Send the verification button to the verify channel")
async def setup_verify(interaction: Interaction):
    # Only allow staff or admin to run this
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("You need admin permissions.", ephemeral=True)
        return
    channel = bot.get_channel(VERIFY_CHANNEL_ID)
    if not channel:
        await interaction.response.send_message("Verify channel not found. Check .env", ephemeral=True)
        return
    embed = Embed(
        title="Verification Required",
        description="Click the button below to verify your identity.",
        colour=Colour.gold()
    )
    view = VerifyView()
    await channel.send(embed=embed, view=view)
    await interaction.response.send_message(f"Verification panel sent to {channel.mention}", ephemeral=True)

# -------------------- REGISTER GROUPS --------------------
bot.tree.add_command(TicketManagement(name="ticket", description="Ticket management commands"))

# -------------------- SYNC & RUN --------------------
@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")
    try:
        guild = bot.get_guild(GUILD_ID)
        if guild:
            await bot.tree.sync(guild=guild)
            print(f"Synced commands to {guild.name}")
        else:
            await bot.tree.sync()
            print("Synced globally (not recommended)")
    except Exception as e:
        print(f"Sync error: {e}")

if __name__ == "__main__":
    if not TOKEN:
        print("No DISCORD_TOKEN set. Exiting.")
    else:
        bot.run(TOKEN)
