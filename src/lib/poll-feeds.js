const { Observable: O } = require('rxjs/Rx')
import R from 'ramda'
const debug = require('debug')('rss-o-bot')

const Poll = require('./shared/poll')
const H = require('./shared/helpers')

/* Takes a store and a feed entity and returns an observable of new links
 * found on that feed.
 */
const queryFeed = ({updateLatestLink, setBlogTitle}) => feed =>
  O.fromPromise(feed.getFilters())
    .do(() => debug(`Downloading ${feed.get('url')}`))
    .switchMap(filters =>
      Poll(
        feed.get('url'),
        filters.map(f => [f.get('keyword'), f.get('kind')])
      )
        .retry(2)
    )
    .concatMap(getNewLinks(feed.get('latestLink')))
    .concatMap(info => O.forkJoin(
      setBlogTitle(feed.get('id'), info.blogTitle),
      updateLatestLink(feed.get('id'), info.link)
    ).mapTo(info))
    .combineLatest(O.fromPromise(feed.getNotifiers({raw: true, attributes: ['notifier']})))
    .do(([{link}]) => debug(`New URL: ${link}`))

/* Takes a feed entity and a stream (curried) and checks exctracts all new
 * items from that stream. Then it returns an observable of those items.
 */
const getNewLinks = latestLink => stream => {
  if (latestLink) {
    const latestIndex = stream.findIndex(e =>
      e.link === latestLink
    )
    const newLinks = stream.slice(0, latestIndex).reverse()
    return O.of(...newLinks)
  } else if (stream[0]) {
    return O.of(stream[0])
  } else if (stream.length < 1) {
    return O.empty()
  } else {
    throw Error('Unexpected state: stream is not an array')
  }
}

const feedIsIn = (ids) => (f) => R.pipe(
  R.invoker(1, 'get')('id'),
  R.toString,
  R.contains(R.__, R.is(Array, ids) ? ids : [ids])
)(f)
const PollFeeds = (store, force, ids) =>
  store.getFeeds(force)
    .map(ids ? R.filter(feedIsIn(ids)) : R.identity)
    .concatMap(feeds =>
      O.merge(...feeds.map(feed =>
        queryFeed(store)(feed)
          .catch((err) => {
            H.log(err)
            return O.empty()
          })
      ))
    )
PollFeeds.queryFeed = queryFeed
module.exports = PollFeeds
