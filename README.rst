.. SPDX-License-Identifier: AGPL-3.0-or-later

.. _SearXNG: https://github.com/searxng/searxng
.. _metasearch engine: https://en.wikipedia.org/wiki/Metasearch_engine
.. _Installation guide: https://docs.searxng.org/admin/installation.html
.. _Configuration guide: https://docs.searxng.org/admin/settings/index.html
.. _CONTRIBUTING: CONTRIBUTING.rst
.. _AI_POLICY: AI_POLICY.rst
.. _LICENSE: LICENSE

.. figure:: client/simple/src/brand/yase.svg
   :target: https://yase.stifild.ru
   :alt: YASE
   :width: 512px


YASE is a privacy-respecting `metasearch engine`_: a fork of SearXNG_ with its own
interface and a few extras. Users are neither tracked nor profiled.

.. image:: https://img.shields.io/github/license/Stifild/yase?style=flat-square&label=license&color=3050ff&cacheSeconds=86400
   :target: LICENSE
   :alt: License

.. image:: https://img.shields.io/github/commit-activity/y/Stifild/yase/master?style=flat-square&label=commits&color=3050ff&cacheSeconds=3600
   :target: https://github.com/Stifild/yase/commits/master/
   :alt: Commits

What is different from SearXNG
==============================

- **New theme.** A single neo-brutalist theme replaces the upstream ones (the
  ``black`` theme is gone). The header and the results are merged into one
  view and the layout is adapted for phones. Design tokens live in
  ``client/simple/src/less/definitions.less``.
- **AI answer.** An optional plugin (``aiAnswer``) summarizes the top results
  with a small language model that runs entirely in the browser
  (transformers.js + WebGPU). Nothing is sent to a third-party AI service.
  Model tiers are chosen by device capabilities; on phones it asks for
  confirmation first.
- **Saner defaults.** AI answer and infinite scroll are enabled out of the box,
  and the set of general-purpose engines is trimmed down.

Everything else (engines, plugins, the limiter, the settings format, the
``searx`` Python module) is inherited from SearXNG and works the same way.

Setup
=====

For a development instance:

.. code:: sh

   make install   # create the Python venv, install dependencies
   make run       # start the dev server

For a production setup follow the upstream `Installation guide`_ and
`Configuration guide`_; the settings format is unchanged. A container build
is described in ``container/``.

Contributing
============

See CONTRIBUTING_. Use of AI tools in contributions is governed by AI_POLICY_.

Changes that are not specific to YASE are better sent to the upstream SearXNG_
project.

License
=======

Licensed under the GNU Affero General Public License (AGPL-3.0), same as
SearXNG. See LICENSE_.
