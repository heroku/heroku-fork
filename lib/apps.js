'use strict';
var _ = require('lodash');
var h = require('heroku-cli-util');

function Apps (heroku) {
  this.heroku = heroku;
}

Apps.prototype = {
  lookupOrgFromApp: function* (app) {
    try {
      return yield this.heroku.request({path: `/organizations/${app.owner.id}`});
    } catch (err) {
      if (err.statusCode === 404) {
        return null;
      } else {
        throw err;
      }
    }
  },

  createNewApp: function* (oldApp, newAppName, stack, region) {
    process.stdout.write(`Forking ${oldApp.name}... `);
    let org = yield this.lookupOrgFromApp(oldApp);
    let info = {
      name: newAppName,
      region: (region || oldApp.region.name),
      stack: (stack || oldApp.stack.name),
      tier: oldApp.tier
    };
    if (org) {
      info.organization = org.name;
      let app = yield this.heroku.request({
        method: 'POST',
        path: org ? '/organizations/apps' : '/apps',
        body: info
      });
      console.log(`done. Forked to ${app.name} in org ${org.name}`);
      return app;
    } else {
      let app = yield this.heroku.apps().create(info);
      console.log(`done. Forked to ${app.name}`);
      return app;
    }
  },

  getLastRelease: function* (app) {
    let releases = yield this.heroku.request({
      path: `/apps/${app.name}/releases`,
      headers: { 'Range': 'version ..; order=desc;'}
    });
    let release = _.chain(releases)
    .filter('slug')
    .first()
    .value();
    if (!release) {
      h.error(`No slug for app ${app.name} was found.
Push some code to ${app.name} before forking it.`);
      process.exit(1);
    }
    return release;
  },

  getLastSlug: function* (app) {
    let release = yield this.getLastRelease(app);
    return yield this.heroku.apps(app.name).slugs(release.slug.id).info();
  },

  copySlug: function* (app, slug) {
    if (slug.commit) {
      process.stdout.write(`Deploying ${slug.commit.substring(0,7)} to ${app.name}... `);
    } else {
      process.stdout.write(`Deploying to ${app.name}... `);
    }
    yield this.heroku.apps(app.name).releases().create({
      slug: slug.id,
      description: `Forked from ${app.name}`
    });
    console.log('done');
  }
};

module.exports = Apps;
