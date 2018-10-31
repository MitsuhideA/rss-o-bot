/**
 * index
 * This module exports a function with a config property.
 * The main function takes no parameters and simply runs
 * the daemon process.
 */
const { Observable: O } = require('rxjs/Rx')
const debug = require('debug')('rss-o-bot')

const Config = require('./lib/config')
const initStore = require('./lib/store')
const pollFeeds = require('./lib/poll-feeds')
const Notify = require('./lib/notify')
const initialize = require('./lib/initialize')
const H = require('./lib/shared/helpers')

const poller = state => {
  const config = state.get('configuration')
  return O.combineLatest(
    initStore(config),
    O.interval(config.get('interval') * 1000).startWith(0)
  )
    .map(([store]) => store)
    .switchMap(pollFeeds)
}
module.exports = function runRSSOBotDaemon (state) {
  const notify = Notify(state.get('configuration'))
  poller(state)
    .do(([{ blogTitle, link, title }]) => { H.log(`New URL in "${blogTitle}": "${link}"`) })
    .flatMap(([{ blogTitle, link, title }, notifiers]) => {
      var notifiersArray = notifiers.map(v => v.notifier)
      return notify(blogTitle, link, title, notifiersArray).retry(2)
    })
    .do(() => debug('Sent notifications'))
    /* Restart on error */
    .catch(err => {
      debug(state)
      H.logError(err)
      return runRSSOBotDaemon(state)
    })
    .subscribe(
      () => {},
      H.logError
    )
}

module.exports.poller = poller
module.exports.pollFeeds = pollFeeds
module.exports.getConfig = Config.readConfig
module.exports.initialize = initialize
