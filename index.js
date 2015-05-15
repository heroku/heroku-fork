exports.topic = {
  name: 'fork',
  description: 'clone an existing app'
};

exports.commands = [
  require('./commands/fork')
];
