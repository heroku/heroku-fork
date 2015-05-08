exports.topics = [{
  name: 'fork',
  description: 'clone an existing app'
}];

exports.commands = [
  require('./commands/fork')
];
