/* eslint-disable import/no-cycle */
import { MessageEmbed } from 'discord.js';
import { db, config, client, logger } from '../main';
import { prunePseudo, secondToDuration } from '../utils';
import MusicBot from './Music';
import SanctionManager from './SanctionManager';

class Moderation {
  static async hardBan(member, reason, moderator) {
    // Suppression de la database
    // On fait ca en premier pour que s'il le rôle sous-fifre, il ne soit pas re-ban par le bot
    // pour déconnexion du discord en étant sous-fifre.
    await db.sanctions.remove({ member: member.id }).catch(console.error);

    // Ban
    member.ban();

    // Suppression du channel perso
    const { guild } = client;
    const chan = guild.channels.cache.find(c => c.name === `${config.moderation.banChannelPrefix}${prunePseudo(member)}` && c.type === 'text');
    if (chan) chan.delete();

    // Envoie d'un log
    const infos = {
      sanction: 'hardban',
      color: config.colors.hardban,
      member,
      mod: moderator,
      reason,
    };
    SanctionManager.addToHistory(infos);
    SanctionManager.addToSanctions(infos);
    SanctionManager.log(infos, guild);
  }

  static async ban(victim, reason, duration, moderator, cmdConfig, message, guild) {
    const role = guild.roles.cache.find(r => r.name === config.moderation.banRole);

    // Durée max des modérateurs forum : 2j
    if (message.member.roles.cache.has(config.roles.forumMod) && (duration === -1 || duration > 172800)) {
      return message.channel.sendError(cmdConfig.durationTooLong.member);
    }

    let chan;
    if (duration !== -1) {
      // Ajouter le rôle Sous-Fiffre
      try {
        await victim.roles.add(role);
      } catch (_err) {
        message.channel.send(config.messages.errors.rolePermissions);
        logger.warn('Swan does not have sufficient permissions to edit GuildMember roles');
      }
      // Créer un channel perso
      chan = await SanctionManager.createChannel(victim, moderator, guild, message);
    }

    const infos = {
      sanction: 'ban',
      color: config.colors.ban,
      member: victim,
      mod: moderator,
      duration,
      finish: duration !== -1 ? Date.now() + duration * 1000 : -1,
      privateChannel: chan,
      reason,
    };

    // Vérifier dans la bdd si le joueur est déjà banni
    const result = await db.sanctions.findOne({ member: victim.id, sanction: 'ban' }).catch(console.error);
    if (result) {
      message.channel.sendSuccess(cmdConfig.durationUpdated.replace('%u', victim).replace('%d', secondToDuration(duration)), message.member);
      if (duration !== -1) {
        db.sanctions.update(
          { _id: result._id },
          { $set: { duration, finish: infos.finish } },
        );
        infos.sanction = 'ban_prolongation';
        SanctionManager.log(infos, guild);
        return chan.send(cmdConfig.sanctionUpdated.replace('%d', secondToDuration(duration)));
      }
      return this.hardBan(victim, reason, moderator);
    }

    if (duration === -1) {
      const successMessage = cmdConfig.successfullyBanned
        .replace('%u', victim.user.username)
        .replace('%r', reason)
        .replace('%d', secondToDuration(duration));
      message.channel.sendSuccess(successMessage, message.member);
      return this.hardBan(victim, reason, moderator);
    }

    // Envoyer les messages
    const successMessage = cmdConfig.successfullyBanned
      .replace('%u', victim.user.username)
      .replace('%r', reason)
      .replace('%d', secondToDuration(duration));
    const whyHere = cmdConfig.whyHere
      .replace('%u', victim.user.username)
      .replace('%r', reason)
      .replace('%d', secondToDuration(duration));
    message.channel.sendSuccess(successMessage, message.member);
    chan.send(whyHere);

    // Envoyer les logs
    SanctionManager.addToHistory(infos);
    SanctionManager.addToSanctions(infos);
    SanctionManager.log(infos, guild);
  }

  static async mute(victim, reason, duration, moderator, cmdConfig, message, guild) {
    const role = guild.roles.cache.find(r => r.name === config.moderation.muteRole);

    // Durée invalide
    if (duration < -1) {
      return message.channel.sendError(cmdConfig.invalidDuration, message.member);
    }
    // Durée maximale des sanctions des modos forum : 2j
    if (message.member.roles.cache.has(config.roles.forumMod) && (duration !== -1 || duration > 172800)) {
      return message.channel.sendError(cmdConfig.durationTooLong, message.member);
    }

    const infos = {
      sanction: 'mute',
      color: config.colors.mute,
      member: victim,
      mod: moderator,
      duration,
      finish: duration !== -1 ? Date.now() + duration * 1000 : -1,
      reason,
    };

    // Vérifier dans la bdd si le joueur est déjà mute
    const result = await db.sanctions.findOne({ member: victim.id, sanction: 'mute' }).catch(console.error);
    if (result) {
      // Si oui on mets à jour la durée du mute
      db.sanctions.update(
        { _id: result._id },
        { $set: {
          duration,
          finish: infos.finish,
        } },
      );
      infos.sanction = 'mute_prolongation';
      message.channel.sendSuccess(cmdConfig.durationUpdated.replace('%u', victim).replace('%d', secondToDuration(duration)), message.member);
      SanctionManager.log(infos, guild);
      return;
    }

    // Ajout du rôle "Bailloné"
    try {
      await victim.roles.add(role);
    } catch (e) {
      message.channel.send(config.messages.errors.rolePermissions);
      logger.warn('Swan does not have sufficient permissions to edit GuildMember roles');
    }

    // Envoyer les messages
    const successMessage = cmdConfig.successfullyMuted
      .replace('%u', victim.user.username)
      .replace('%r', reason)
      .replace('%d', secondToDuration(duration));
    message.channel.sendSuccess(successMessage, message.member);

    // Envoyer les logs
    SanctionManager.addToHistory(infos);
    SanctionManager.addToSanctions(infos);
    SanctionManager.log(infos, guild);
  }

  static async warn(victim, reason, moderator, cmdConfig, message, guild) {
    // Envoyer les messages
    const date = Date.now();

    const successMessage = cmdConfig.successfullyWarned.replace('%u', victim.user.username).replace('%r', reason).replace('%d', date);
    message.channel.sendSuccess(successMessage, message.member);
    victim.send(cmdConfig.warning.replace('%u', victim.user.username).replace('%r', reason));

    // Vérifier s'il a dépasser la limite d'avertissement avant le banissement
    const result = await db.sanctionsHistory.findOne({ memberId: victim.id }).catch(console.error);
    if (result && result.currentWarnCount + 1 === config.moderation.warnLimitBeforeBan) {
      message.channel.send(cmdConfig.warnLimitReached);
      this.ban(victim, config.moderation.warnBanReason, config.moderation.warnBanTime, moderator, config.messages.commands.ban, message, guild);
    }

    // Envoyer les logs
    const infos = {
      sanction: 'warn',
      color: config.colors.warn,
      member: victim,
      mod: moderator,
      reason,
      id: date,
    };
    SanctionManager.addToHistory(infos, date);
    SanctionManager.log(infos, guild);
  }

  static async kick(victim, reason, moderator, cmdConfig, message, guild) {
    // Kick
    const hasBeenKicked = await victim.kick(reason).catch(error => void console.error(error)); // eslint-disable-line no-void

    if (!hasBeenKicked) return message.channel.sendError(cmdConfig.couldntKick, message.member);

    // Envoyer les messages
    const successMessage = cmdConfig.successfullyKicked.replace('%u', victim.user.username).replace('%r', reason);
    message.channel.sendSuccess(successMessage, message.member);

    // Envoyer les logs
    const infos = {
      sanction: 'kick',
      color: config.colors.kick,
      member: victim,
      mod: moderator,
      reason,
    };
    SanctionManager.addToHistory(infos);
    SanctionManager.log(infos, guild);
  }

  static async musicRestriction(requestedBy, moderator, music, logChannel, message) {
    // Regarde dans la bdd si le joueur est déjà interdit des commandes de musique
    const result = await db.sanctions.findOne({ member: requestedBy.id, sanction: 'music_restriction' }).catch(console.error);
    const infos = {
      color: config.bot.musicrestriction,
      member: requestedBy,
      mod: moderator,
      duration: 7 * 24 * 60 * 60, // 7 jours
      finish: Date.now() + 604800000,
      reason: `Musique inapropriée \`${music.title}\` (${music.video.shortURL})`,
    };

    // Si oui, alors on ralonge la restriction
    if (result) {
      await db.sanctions.update({ _id: result._id }, { $set: { finish: Date.now() + 604800000 } }).catch(console.error);
      infos.sanction = 'music_restriction_prolongation';

      SanctionManager.addToHistory(infos);
      SanctionManager.log(infos, message.guild, result);

      logChannel.send(':warning: **Cet utilisateur a déjà une restriction de musique, elle à donc été ralongée.**');
    } else {
      // Si non, alors on lui interdits les commandes de musique
      MusicBot.restricted.push(requestedBy.id);
      infos.sanction = 'music_restriction';

      SanctionManager.addToHistory(infos);
      SanctionManager.addToSanctions(infos);
      SanctionManager.log(infos, message.guild);
    }
  }

  static async unban(victim, reason, moderator, cmdConfig, message, guild) {
    // Regarde dans la bdd si le joueur est banni
    const result = await db.sanctions.findOne({ member: victim.id, sanction: 'ban' }).catch(console.error);
    if (!result) return message.channel.sendError(cmdConfig.notBanned.replace('%u', victim), message.member);
    if (!message.member.roles.cache.has(config.roles.owner) && result.modid !== message.author.id) return message.channel.sendError(cmdConfig.notYou, message.member);

    const channelName = `${config.moderation.banChannelPrefix}${prunePseudo(victim)}`;
    const chan = guild.channels.cache.find(c => c.name === channelName && c.type === 'text');
    let file;

    if (chan) {
      const allMessages = await SanctionManager.getAllMessages(chan);
      const originalModerator = message.guild.members.cache.get(result.modid);
      file = SanctionManager.getMessageHistoryFile({ victim, moderator: originalModerator, reason: result.reason }, allMessages);

      chan.delete();
    }

    const successMessage = cmdConfig.successfullyUnbanned
      .replace('%u', victim.user.username)
      .replace('%r', reason);
    message.channel.sendSuccess(successMessage, message.member);

    SanctionManager.addToHistory({
      member: victim,
      mod: moderator,
      sanction: 'unban',
      reason,
    });
    SanctionManager.removeSanction({
      member: victim,
      title: 'Nouveau cas :',
      mod: moderator,
      sanction: 'ban',
      reason,
      id: result._id,
      file,
    }, guild, message.channel);
  }

  static async unmute(victim, reason, moderator, cmdConfig, message, guild) {
    // Regarde dans la database si le joueur est mute
    const result = await db.sanctions.findOne({ member: victim.id, sanction: 'mute' }).catch(console.error);

    if (!result) return message.channel.sendError(cmdConfig.notMuted.replace('%u', victim), message.member);
    if (result.modid !== message.author.id) return message.channel.sendError(cmdConfig.notYou, message.member);

    const successMessage = cmdConfig.successfullyUnmuted
      .replace('%u', victim.user.username)
      .replace('%r', reason);
    message.channel.sendSuccess(successMessage, message.member);

    SanctionManager.addToHistory({
      member: victim,
      mod: moderator,
      sanction: 'unmute',
      reason,
    });
    SanctionManager.removeSanction({
      member: victim,
      title: 'Nouveau cas :',
      mod: moderator,
      sanction: 'mute',
      id: result._id,
      reason,
    }, guild, message.channel);
  }

  static async removeWarn(victim, id, reason, moderator, cmdConfig, message, guild) {
    // Regarde dans la database si le warn existe
    const userHistory = await db.sanctionsHistory.findOne({ memberId: victim.id }).catch(console.error);
    if (!userHistory) return message.channel.sendError(cmdConfig.noSanction.replace('%u', victim), message.member);

    const warn = userHistory.sanctions.find(elt => elt.type === 'warn' && elt.date.toString() === id);
    if (!warn) return message.channel.sendError(cmdConfig.notWarned.replace('%u', victim).replace('%d', id), message.member);
    if (userHistory.revokedWarns.includes(warn.date.toString())) return message.channel.sendError(cmdConfig.alreadyRevoked, message.member);
    if (warn.mod !== message.author.id) return message.channel.sendError(cmdConfig.notYou, message.member);

    const successMessage = cmdConfig.successfullyUnwarned
      .replace('%u', victim.user.username)
      .replace('%d', id)
      .replace('%r', reason);
    message.channel.sendSuccess(successMessage, message.member);

    SanctionManager.addToHistory({
      member: victim,
      mod: moderator,
      sanction: 'unwarn',
      id,
      reason,
    });
    await db.sanctionsHistory.update(
      { memberId: victim.id },
      {
        $inc: { currentWarnCount: -1 },
        $push: { revokedWarns: id.toString() },
      },
    ).catch(console.error);

    const embed = new MessageEmbed()
      .setColor(config.colors.success)
      .setTitle('Nouveau cas :')
      .setTimestamp()
      .addField(':bust_in_silhouette: Utilisateur', `${victim.toString()}\n(${victim.id})`, true)
      .addField(':cop: Modérateur', `${warn.mod.toString()}\n(${warn.mod.id})`, true)
      .addField(':tools: Action', "Suppression d'un avertissement", true)
      .addField(':label: Raison', `${reason}\nID du warn : ${id}`, true);
    guild.channels.cache.get(config.channels.logs).send(embed);
  }

  static async removeMusicRestriction(victim, reason, moderator, cmdConfig, message, guild) {
    // Regarde dans la database si le joueur est interdit des commandes de musique
    const result = await db.sanctions.findOne({ member: victim.id, sanction: 'music_restriction' }).catch(console.error);

    if (!result) return message.channel.sendError(cmdConfig.notRestricted.replace('%u', victim), message.member);

    const successMessage = cmdConfig.successfullyRemoveRestr
      .replace('%u', `${victim.user.username}`)
      .replace('%r', reason);
    message.channel.sendSuccess(successMessage, message.member);

    const index = MusicBot.restricted.indexOf(victim.id);
    MusicBot.restricted.splice(index, 1);

    SanctionManager.addToHistory({
      member: victim,
      mod: moderator,
      sanction: 'remove_music_restriction',
      reason,
    });
    SanctionManager.removeSanction({
      member: victim,
      title: 'Nouveau cas :',
      mod: moderator,
      sanction: 'music_restriction',
      id: result._id,
      reason,
    }, guild);
  }
}

client.on('guildMemberRemove', async (member) => {
  if (await SanctionManager.isBan(member.id)) Moderation.hardBan(member, config.messages.miscellaneous.hardBanAutomatic, client.user);
});

export default Moderation;
