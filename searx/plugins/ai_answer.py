# SPDX-License-Identifier: AGPL-3.0-or-later
# pylint: disable=missing-module-docstring

import typing as t

from flask_babel import gettext  # pyright: ignore[reportUnknownVariableType]

from searx.plugins import Plugin, PluginInfo

if t.TYPE_CHECKING:
    from searx.plugins import PluginCfg


@t.final
class SXNGPlugin(Plugin):
    """Summarizes the top results with a language model that runs in the
    browser.  The model is downloaded only after the user clicks the button;
    queries and results never leave the client."""

    id = "aiAnswer"

    def __init__(self, plg_cfg: "PluginCfg") -> None:
        super().__init__(plg_cfg)

        self.info = PluginInfo(
            id=self.id,
            name=gettext("AI answer"),
            description=gettext("Summarizes the top results with a language model that runs in your browser"),
            preference_section="ui",
        )
