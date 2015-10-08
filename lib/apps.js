'use strict';
var _ = require('lodash');

function Apps (heroku) {
  this.heroku = heroku;
}

Apps.prototype = {
  getApp: function* (app) {
    try {
      return yield this.heroku.apps(app).info();
    } catch(err) {
      if (err.statusCode === 404) {
        console.error(`Couldn't find app ${app}.`);
        process.exit(1);
      } else { throw err; }
    }
  },

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

  createNewApp: function* (oldApp, newAppName, region) {
    process.stdout.write(`Forking ${oldApp.name}... `);
    let org = yield this.lookupOrgFromApp(oldApp);
    let info = {
      name: newAppName,
      region: (region || oldApp.region.name),
      stack: oldApp.stack.name,
      tier: oldApp.tier
    };
    try {
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
    } catch (err) {
      if (err.statusCode === 422 && err.body.message === 'Name is already taken') {
        console.error(`app ${info.name} already exists.`);
        process.exit(1);
      } else { throw err; }
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
      throw new Error(`No slug for app ${app.name} was found.
Push some code to ${app.name} before forking it.`);
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
  },

  setBuildpacks: function (oldApp, newApp) {
    let heroku = this.heroku;
    return heroku.request({
      headers: {'Range': ''},
      path: `/apps/${oldApp.name}/buildpack-installations`
    }).then(function (buildpacks) {
      if (buildpacks.length === 0) { return; }
      buildpacks = buildpacks.map(function (buildpack) {
        return {buildpack: buildpack.buildpack.url};
      });
      return heroku.request({
        method: 'PUT',
        body: {updates: buildpacks},
        headers: {'Range': ''},
        path: `/apps/${newApp.name}/buildpack-installations`
      });
    });
  }
};

module.exports = Apps;
