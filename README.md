heroku-fork
===========

Heroku CLI plugin to fork an existing app into a new app.

**DEPRECATED**: Heroku fork is deprecated as a core command. It will no longer be included in the CLI 2017-12-01.
We recommend using review apps instead of fork if it will work for your use-case: https://devcenter.heroku.com/articles/github-integration-review-apps
You may also fork this Github project to continue using this project as a CLI plugin. See https://devcenter.heroku.com/articles/developing-cli-plugins for more information on developing plugins.

Commands
========

heroku fork [NEWNAME]
---------------------

Fork an existing app into a new one

`--region` specify a region

`--skip-pg` skip postgres databases

`--from` app to fork from

`--to` app to create

`-a, --app` undefined

```
Copy config vars and Heroku Postgres data, and re-provision add-ons to a new app.
New app name should not be an existing app. The new app will be created as part of the forking process.

Example:

  $ heroku fork --from my-production-app --to my-development-app
```
