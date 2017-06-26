heroku-fork
===========

Heroku CLI plugin to fork an existing app into a new app.

**DEPRECATED**: Heroku fork is deprecated as a core command. It will no longer be included in the CLI by default 2017-12-01. We recommend using [review apps](https://devcenter.heroku.com/articles/github-integration-review-apps) instead of fork if it will work for your use-case:. You may also fork the [Github project](https://github.com/heroku/heroku-fork) to continue using this project as a CLI plugin. See [Developing CLI Plugins](https://devcenter.heroku.com/articles/developing-cli-plugins) for more information on developing plugins.

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

Use `heroku fork` to copy an existing application, including add-ons, config vars, and Heroku Postgres data.

It is a common practice to maintain [more than one environment](multiple-environments) for each application. For example, a staging and production environment for each app along with any number of ephemeral test environments for features in various stages of development. To ensure parity across applications, create new apps as forks from the production environment.

>warning
>Forked applications are created in the account of the user executing `heroku fork`. The forking user will be the owner of the app and responsible for any application charges. For this reason, your account needs to be verified if the application you're forking contains paid resources.

## Setup

You must have the [Heroku CLI](heroku-cli) installed to use the features described here. [Verify your CLI installation](heroku-cli#download-and-install) and update it to the latest version with `heroku update`.

## Fork application

>note
>For the purpose of this guide the originating app is called `sourceapp` and the new forked app is `targetapp`.

>callout
Any add-ons with paid plans on the old app will be provisioned with the same paid plans on the new app. Adjust your add-on plans as needed by up- or down-grading after forking.

Invoke `heroku fork` to create the target app, copy all Heroku Postgres data and config vars to the new app, and re-provision all add-ons with the same plan. Depending on the size of your database this process may take some time.

>warning
>Only Heroku Postgres data is automatically copied to the new application. All other add-ons are simply re-provisioned and you will need to manually manage any requisite data export/import for these services.

>callout
>Don't create `targetapp` yourself. `heroku fork` creates the target app as part of the forking process.

```term
$ heroku fork --from sourceapp --to targetapp
Creating fork targetapp... done
Copying slug... done
Adding heroku-postgresql:dev... done
Creating database backup from sourcapp... .. done
Restoring database backup to targetapp... .. done
Copying config vars... done
Fork complete, view it at http://targetapp.herokuapp.com/
```

To fork an app to a non-default [region](regions), use the `--region` flag:

```term
$ heroku fork --from sourceapp --to targetapp --region eu
```

### Add-on failures

Some add-ons may fail provisioning if they're no longer available.

```term
$ heroku fork --from sourceapp --to targetapp
Creating fork targetapp... done
Copying slug... ........ done
Adding airbrake:developer... done
Adding bonsai:test... skipped (not found)
...
```

If the add-ons can't be provisioned because the original plan no longer exists, upgrade the plan on the source app and retry the fork.

>callout
>If you've already run `heroku fork` you will need to destroy the target app before retrying: `heroku destroy -a targetapp`.


```term
$ heroku addons:upgrade bonsai:starter -a sourceapp
Upgrading to bonsai:starter on sourceapp... done, v207 (free)
```

## Manual add-on configuration

There are some add-ons that require additional configuration after provisioning. There may be others beyond the add-ons listed so please review your app's add-ons for any that have manually entered configuration.

### Heroku Postgres

All Heroku Postgres databases on your application will be copied from your `sourceapp` to your target app using `pg:copy`. [Heroku Postgres fork](https://devcenter.heroku.com/articles/heroku-postgres-fork) is not used for this. If you have followers, this will result in duplicate copies that are not currently following your leader database. 

For the larger size databases, this step will take a long time. You can skip this step by passing `--skip-pg` flag:

```term
$ heroku fork --from sourceapp --to targetapp --skip-pg
```

With `--skip-pg` flag, Heroku Postgres databases will not be created on the target app. You can create it manually after `heroku fork`, or you could also use Heroku Postgres fork.

>callout
>It is recommended to make sure if you have an expected Heroku Postgres setup with your target app. Please run `heroku pg:info` and/or `heroku config` command to make sure that everything has copied as you expected. If the copied database is not being the primary database (`DATABASE_URL`), use `heroku pg:promote` as described by the [Heroku Postgres documentation](https://devcenter.heroku.com/articles/heroku-postgresql#establish-primary-db) to make it a primary database.

### Custom domains

Since custom domains can only belong to a single app at a time, no custom domains are copied as part of the forking process. If you want to use [custom domains](custom-domains) in your new environment you will need to add them yourself as well as make the necessary DNS additions.

### SSL

>warning
>If your forked app doesn't need to use SSL, remove the add-on with `heroku addons:destroy ssl` to avoid unnecessary charges.


Although the forking process re-provisions the [SSL Endpoint](ssl-endpoint) on `targetapp` it does not add any certs on your behalf. If your app uses custom domains with SSL you need to add [new certs to your SSL endpoint instance](ssl-endpoint#setting-up-ssl-on-heroku) on `targetapp`.

```term
$ heroku certs:add server.crt server.key -a targetapp
Resolving trust chain... done
Adding SSL Endpoint to targetapp... done
example now served by tokyo-1234.herokussl.com
```

Add a new DNS CNAME record utilizing this new endpoint URL to serve requests via HTTPS.

<table>
  <tr>
    <th>Type</th>
    <th>Name</th>
    <th>Target</th>
  </tr>
  <tr>
    <td>CNAME</td>
    <td>www</td>
    <td>tokyo-1234.herokussl.com</td>
  </tr>
</table>

### Scheduler

The [Heroku Scheduler](https://elements.heroku.com/addons/scheduler) add-on requires that the job schedule be manually transferred. Open the scheduler dashboard for both `sourceapp` and `targetapp` side-by-side to view the diffs and manually copy the jobs.

```term
$ heroku addons:open scheduler -a sourceapp
$ heroku addons:open scheduler -a targetapp
```

## Deploy

Forking your application doesn't automatically create a new git remote in your current project. To deploy to `targetapp` you will need to establish the git remote yourself. Use `heroku info` to retrieve the Git URL of the new application and the set it manually.

```term
$ heroku info -a targetapp
=== targetapp
...
Git URL:       git@heroku.com:targetapp.git
...
```

Add a git remote named `forked` representing the deploy URL for `targetapp`.

```term
$ git remote add forked git@heroku.com:targetapp.git
```

Deploy to the new environment with:

```term
$ git push forked master
```

If you wish to make the new app the default deployment target you can rename the git remotes.

```term
$ git remote rename heroku old
$ git remote rename forked heroku
```

## Forked app state

Forked apps are as close to the source app as possible. However, there are some differences.

### Git repository

When forking, the slug currently running in the forked app is copied to the new app. The Git repository contents of old app are _not_ copied to the Git repository of the new app.

### Dynos

Forked applications are similar to new apps in that they are scaled to the default [dyno formation](https://devcenter.heroku.com/articles/scaling#dyno-formation) consisting of a single web dyno and no worker or other dynos.

Scale your forked application's dynos to meet your needs:

```term
$ heroku ps:scale web=1 worker=1 -a targetapp
```

### Collaborators

No users from the source app are transferred over to the forked app. You need to add collaborators yourself.

```term
$ heroku access:add colleague@example.com -a targetapp
```

### Database followers

The forking process copies all databases present on `sourceapp` but does not retain any [fork](https://devcenter.heroku.com/articles/heroku-postgres-fork)/[follow](https://devcenter.heroku.com/articles/heroku-postgres-follower-databases) relationships between them. Remove extraneous databases yourself and manually re-establish any forks or followers.

### Labs features

Any enabled [Heroku Labs](https://devcenter.heroku.com/categories/labs) features on `sourceapp` are not re-enabled on `targetapp`.
