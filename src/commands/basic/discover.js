import Command from '../../structures/Command';
import Help from './help';

class Discover extends Command {
  constructor() {
    super('Discover');
    this.aliases = ['discover', 'découvrir', 'decouvrir'];
    this.usage = 'discover';
    this.examples = ['discover'];
  }

  async execute(client, message, _args) {
    let result;
    while (!result) {
      const command = client.commands[Math.floor(Math.random() * client.commands.length)];
      // Les gérants ont toutes les permissions
      if (message.member.roles.cache.has(client.config.roles.owner)) result = command;
      // Check des permissions
      if (command.permissions.length === 0) result = command;
      for (const perm of command.permissions) {
        if (message.member.roles.cache.find(role => role.name === perm)) result = command;
      }
    }
    new Help().sendDetails(client.config, message, result);
  }
}

export default Discover;
