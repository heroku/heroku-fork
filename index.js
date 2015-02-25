exports.topics = [{
  name: '_fork',
  description: 'clone an existing app'
}];

exports.commands = [
  require('./lib/commands/fork')
];
