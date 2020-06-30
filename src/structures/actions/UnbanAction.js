import ModerationAction from './ModerationAction';
import { client, db } from '../../main';
import SanctionManager from '../SanctionManager';
import ACTION_TYPE from './actionType';

class UnbanAction extends ModerationAction {
  constructor(data) {
    super(data);
    this.config = client.config.messages.commands.unban;
  }

  async exec(_document) {
    // Regarde dans la bdd si le joueur est banni
    const ban = await db.sanctions.findOne(
      { member: this.data.victimId,
        $or: [
          { type: ACTION_TYPE.HARDBAN },
          { type: ACTION_TYPE.BAN },
        ] },
    ).catch(console.error);
    if (ban.type === ACTION_TYPE.HARDBAN || !this.data.member) {
      const isBanned = await client.guild.fetchBan(this.data.victimId).catch(console.error);
      if (isBanned) await client.guild.members.unban(this.data.victimId, this.data.reason).catch(console.error);
    } else if (ban.type === ACTION_TYPE.BAN) {
      await SanctionManager.removeRole(this.data);
      const file = await SanctionManager.removeChannel(this.data);
      this.data.setFile(file);
    }

    if (!this.data.sendSuccessIfBot && this.data.moderator.user.bot) return;
    const successMessage = this.config.successfullyUnbanned
      .replace('%u', this.data.getUserName())
      .replace('%r', this.data.reason);
    this.data.messageChannel.sendSuccess(successMessage, this.data.moderator);
  }
}

export default UnbanAction;
