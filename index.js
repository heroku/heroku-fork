exports.topics = [{
  name: 'fork',
  description: 'clone an existing app'
}];

exports.commands = [{
  topic: 'fork',
  needsAuth: true,
  needsApp: true,
  help: `Fork an existing app -- copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.`,
  flags: [
    {name: 'stack', char: 's', description: 'specify a stack for the new app', hasValue: true},
    {name: 'region', description: 'specify a region', hasValue: true},
    {name: 'skip-pg', description: 'skip postgres databases', hasValue: false}
  ],
  args: [{name: 'newname', optional: true}],
  run: require('./lib/fork')
}];
