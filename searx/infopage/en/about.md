# About YASE

YASE is a [metasearch engine], aggregating the results of other
{{link('search engines', 'preferences')}} while not storing information about
its users.

The YASE project is driven by an open community. Come join us on Matrix if
you have questions or just want to chat about YASE at [#searxng:matrix.org]

Make YASE better:

- You can improve YASE translations at [Weblate], or...
- Track development, send contributions, and report issues at [YASE sources].
- To get further information, visit YASE's project documentation at [YASE
  docs].

## Why use it?

- YASE may not offer you as personalized results as Google, but it doesn't
  generate a profile about you.
- YASE doesn't care about what you search for, never shares anything with a
  third-party, and can't be used to compromise you.
- YASE is free software; the code is 100% open, and everyone is welcome to
  make it better.

If you do care about privacy, want to be a conscious user, or otherwise believe
in digital freedom, make YASE your default search engine or run it on your
own server!

## How do I set it as the default search engine?

YASE supports [OpenSearch].  For more information on changing your default
search engine, see your browser's documentation:

- [Firefox]
- [Microsoft Edge] - Behind the link, you will also find some useful instructions
  for Chrome and Safari.
- [Chromium]-based browsers only add websites that the user navigates to without
  a path.

When adding a search engine, there must be no duplicates with the same name.  If
you encounter a problem where you cannot add the search engine, you can either:

- Remove the duplicate (default name: YASE) or
- Contact the owner to give the instance a different name from the default.

## How does it work?

YASE is a fork of the well-known [searx] [metasearch engine] which was
inspired by the [Seeks project].  It provides basic privacy by mixing your
queries with searches on other platforms without storing search data.  YASE
can be added to your browser's search bar; moreover, it can be set as the
default search engine.

The {{link('stats page', 'stats')}} contains some useful anonymous usage
statistics about the engines used.

## How can I make it my own?

YASE appreciates your concern regarding logs, so take the code from the
[YASE sources] and run it yourself!

Add your instance to this [list of public
instances]({{get_setting('brand.public_instances')}}) to help other people
reclaim their privacy and make the internet freer.  The more decentralized the
internet is, the more freedom we have!


[YASE sources]: {{GIT_URL}}
[#searxng:matrix.org]: https://matrix.to/#/#searxng:matrix.org
[YASE docs]: {{get_setting('brand.docs_url')}}
[searx]: https://github.com/searx/searx
[metasearch engine]: https://en.wikipedia.org/wiki/Metasearch_engine
[Weblate]: https://translate.codeberg.org/projects/searxng/
[Seeks project]: https://beniz.github.io/seeks/
[OpenSearch]: https://github.com/dewitt/opensearch/blob/master/opensearch-1-1-draft-6.md
[Firefox]: https://support.mozilla.org/en-US/kb/add-or-remove-search-engine-firefox
[Microsoft Edge]: https://support.microsoft.com/en-us/help/4028574/microsoft-edge-change-the-default-search-engine
[Chromium]: https://www.chromium.org/tab-to-search
