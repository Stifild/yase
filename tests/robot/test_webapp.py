# SPDX-License-Identifier: AGPL-3.0-or-later
# pylint: disable=missing-module-docstring,disable=missing-class-docstring,invalid-name

import base64
import tempfile
from time import sleep

url = "http://localhost:11111/"


def test_index(browser):
    # Visit URL
    browser.visit(url)
    assert browser.is_text_present('YASE')


def test_404(browser):
    # Visit URL
    browser.visit(url + 'missing_link')
    assert browser.is_text_present('Page not found')


def test_about(browser):
    browser.visit(url)
    browser.links.find_by_text('YASE').click()
    assert browser.is_text_present('Why use it?')


def test_preferences(browser):
    browser.visit(url)
    browser.links.find_by_href('/preferences').click()
    assert browser.is_text_present('Preferences')
    assert browser.is_text_present('COOKIES')

    assert browser.is_element_present_by_xpath('//label[@for="checkbox_dummy"]')


def test_preferences_engine_select(browser):
    browser.visit(url)
    browser.links.find_by_href('/preferences').click()

    assert browser.is_element_present_by_xpath('//label[@for="tab-engines"]')
    browser.find_by_xpath('//label[@for="tab-engines"]').first.click()

    assert not browser.find_by_xpath('//input[@id="engine_general_dummy__general"]').first.checked
    browser.find_by_xpath('//label[@for="engine_general_dummy__general"]').first.check()
    browser.find_by_xpath('//input[@type="submit"]').first.click()

    # waiting for the redirect - without this the test is flaky..
    sleep(1)

    browser.visit(url)
    browser.links.find_by_href('/preferences').click()
    browser.find_by_xpath('//label[@for="tab-engines"]').first.click()

    assert browser.find_by_xpath('//input[@id="engine_general_dummy__general"]').first.checked


def test_preferences_locale(browser):
    browser.visit(url)
    browser.links.find_by_href('/preferences').click()

    browser.find_by_xpath('//label[@for="tab-ui"]').first.click()
    browser.select('locale', 'fr')
    browser.find_by_xpath('//input[@type="submit"]').first.click()

    # waiting for the redirect - without this the test is flaky..
    sleep(1)

    browser.visit(url)
    browser.links.find_by_href('/preferences').click()
    browser.is_text_present('Préférences')


def test_wallpaper_upload(browser):
    browser.driver.set_window_size(1600, 900)
    browser.visit(url)
    browser.links.find_by_href('/preferences').click()
    browser.find_by_xpath('//label[@for="tab-ui"]').first.click()

    with tempfile.NamedTemporaryFile(suffix='.png') as wallpaper:
        wallpaper.write(
            base64.b64decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
            )
        )
        wallpaper.flush()
        browser.driver.find_element('id', 'wallpaper-upload').send_keys(wallpaper.name)
        assert browser.is_text_present('Wallpaper saved in this browser.', wait_time=5)

    assert browser.evaluate_script("document.documentElement.classList.contains('has-wallpaper')")
    browser.visit(url + 'search?q=test')
    assert browser.evaluate_script("document.documentElement.classList.contains('has-wallpaper')")
    assert (
        browser.evaluate_script("getComputedStyle(document.querySelector('#search_header')).backgroundColor")
        == 'rgba(0, 0, 0, 0)'
    )
    assert (
        browser.evaluate_script("getComputedStyle(document.querySelector('#search_header')).backdropFilter") == 'none'
    )
    assert 'blur(' in browser.evaluate_script("getComputedStyle(document.querySelector('.search_box')).backdropFilter")
    assert (
        browser.evaluate_script("getComputedStyle(document.querySelector('#search_logo'), '::before').content")
        == 'none'
    )
    assert browser.evaluate_script(
        "getComputedStyle(document.querySelector('#search_logo svg')).filter.includes('4px 8px')"
    )
    assert 'blur(' in browser.evaluate_script(
        "getComputedStyle(document.querySelector('.search_filters select')).backdropFilter"
    )
    assert 'blur(' in browser.evaluate_script(
        "getComputedStyle(document.querySelector('.category_button, .category_checkbox label')).backdropFilter"
    )
    assert (
        browser.evaluate_script("getComputedStyle(document.querySelector('.search_filters')).backgroundColor")
        == 'rgba(0, 0, 0, 0)'
    )
    browser.driver.set_window_size(756, 413)
    assert (
        browser.evaluate_script("getComputedStyle(document.querySelector('#search_logo')).backgroundColor")
        == 'rgba(0, 0, 0, 0)'
    )
    browser.driver.set_window_size(1600, 900)
    browser.execute_script("""
        const answers = document.createElement('div');
        answers.id = 'answers';
        answers.innerHTML = '<div class="ai-answer"></div>';
        document.querySelector('#results').prepend(answers);
        const result = document.createElement('article');
        result.className = 'result';
        document.querySelector('#urls').append(result);
        const infobox = document.createElement('aside');
        infobox.className = 'infobox';
        document.querySelector('#sidebar').append(infobox);
        """)
    assert 'blur(' in browser.evaluate_script("getComputedStyle(document.querySelector('#answers')).backdropFilter")
    assert 'blur(' in browser.evaluate_script(
        "getComputedStyle(document.querySelector('#urls .result')).backdropFilter"
    )
    assert 'blur(' in browser.evaluate_script(
        "getComputedStyle(document.querySelector('#sidebar .infobox')).backdropFilter"
    )

    browser.visit(url + 'preferences')
    assert 'blur(' in browser.evaluate_script(
        "getComputedStyle(document.querySelector('main.page_with_header')).backdropFilter"
    )
    browser.find_by_xpath('//label[@for="tab-ui"]').first.click()
    assert (
        browser.evaluate_script("getComputedStyle(document.querySelector('#main_preferences select')).backgroundColor")
        == 'rgba(0, 0, 0, 0)'
    )
    browser.find_by_id('wallpaper-remove').click()
    assert browser.is_text_present('Wallpaper removed.')
    assert not browser.evaluate_script("document.documentElement.classList.contains('has-wallpaper')")


def test_search(browser):
    browser.visit(url)
    browser.fill('q', 'test search query')
    browser.find_by_xpath('//button[@type="submit"]').first.click()
    assert browser.is_text_present('No results were found')
