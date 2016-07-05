/**
 * index
 * This module exports a function with a config property.
 * The main function takes no parameters and simply runs
 * the daemon process.
 */
const Rx = require('rx')
const O = Rx.Observable
const debug = require('debug')('rss-o-bot')

const H = require('./lib/helpers')
const Config = require('./lib/config')
const Notify = require('./lib/notify')
const poll = require('./lib/poll')
const initStore = require('./lib/store')

module.exports = function runRSSOBotDaemon (state) {
  const config = state.get('configuration')
  O.combineLatest(
    initStore(config),
    Rx.Observable.interval(config.get('interval') * 1000).startWith(0)
  )
    .flatMap(([s]) => pollFeeds(s))
    .subscribe(
      () => {},
      console.error
    )
}

module.exports.pollFeeds = pollFeeds
module.exports.getConfig = Config.readConfig

const queryFeed = ({updateLatestLink, setBlogTitle}) => feed => {
  const feed$ = O.fromPromise(feed.getFilters())
    .flatMap(filters =>
        poll(
          feed.get('url'),
          filters.map(f => [f.get('keyword'), f.get('kind')])
      ).retry(2)
    )

  return (
    feed$
      .flatMap(getNewLinks(feed))
      .filter(({link}) =>
        (link && link !== feed.get('latestLink')) || debug(`Old URL: ${link}`)
      )
      .flatMap(info =>
        feed.get('blogTitle')
          ? O.of(info)
          : setBlogTitle(feed.get('id'), info.blogTitle)
      )
      .flatMap(info =>
        updateLatestLink(feed.get('id'), info.link).map(() => info)
      )
      .filter(() => feed.get('latestLink'))
      .tap(({link}) => debug(`New URL: ${link}`))
    )
}

const notifyWrapper = notify => ({ blog, link, title }) =>
  notify(blog, link, title)
    .tap(() => debug('Sent notifications'))
    .retry(2)

function pollFeeds (config, store, force) {
  return (
    O.forkJoin(
      O.of(Notify(config)),
      store.getFeeds(force)
    )
      .flatMap(([notify, feeds]) => {
        const queries$ = Rx.Observable.forkJoin(
          feeds.map(queryFeed(store))
          .flatMap(notifyWrapper(notify))
        )
        return H.catchAndLogErrors(queries$)
      })
  )
}

const getNewLinks = feed => stream =>
  feed.get('latestLink')
    ? O.fromArray(stream.slice(
      0,
      stream.findIndex(e => e.link === feed.get('latestLink'))
    ).reverse())
    : O.of(stream[0])

