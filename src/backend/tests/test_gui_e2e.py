"""
Detailed GUI-based end-to-end test between TWO anonymous users through a
shared invitation link, driven by real Chromium browsers (Playwright):

  1. Happy path: create room -> share link -> join -> XBF-MKC handshake ->
     matching SAS on both screens -> mutual key confirmation ->
     bidirectional encrypted chat. Asserts the server never sees plaintext.
  2. MITM path: same flow through an active attacker that rewrites public
     keys in transit -> both screens must show MITM alert + mismatched SAS
     and messaging must stay disabled.

Requires LD_LIBRARY_PATH to include extracted NSS/NSPR libs for headless
chromium (see run_gui_tests.sh).
"""
import re
import time

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import sync_playwright  # noqa: E402

from tests.gui_stack import GUIStack  # noqa: E402

LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"]


def _init_ws(page, ws_url: str):
    page.add_init_script(f"localStorage.setItem('rantchit_ws_base', {ws_url!r})")


def _capture_ws_frames(page):
    """Records every WebSocket frame the page SENDS toward the server."""
    sent = []

    def on_ws(ws):
        ws.on("framesent", lambda payload: sent.append(str(payload)))

    page.on("websocket", on_ws)
    return sent


def _create_room(page, base_url, ws_url):
    _init_ws(page, ws_url)
    page.goto(base_url, wait_until="load")
    page.click('button:has-text("Create Encrypted Room")')
    page.wait_for_selector('[data-testid="invite-url-input"]', timeout=10000)
    link = page.input_value('[data-testid="invite-url-input"]')
    page.click('button:has-text("Done")')
    return link


def _join_room(page, invite_link, ws_url):
    _init_ws(page, ws_url)
    page.goto(invite_link, wait_until="load")


def _read_sas_code(page):
    page.click('[data-testid="verify-sas-btn"]')
    page.wait_for_selector('[data-testid="sas-code"]', timeout=10000)
    code = re.sub(r"\s+", "", page.inner_text('[data-testid="sas-code"]'))
    emojis = re.sub(r"\s+", "", page.inner_text('[data-testid="sas-emojis"]'))
    # Closing the modal via its confirm button also marks the peer verified.
    page.click('button:has-text("Confirm Codes Match")')
    return code, emojis


def _send_and_expect(page_from, page_to, text, timeout=10000):
    page_from.fill('[data-testid="chat-input"]', text)
    page_from.click('[data-testid="chat-send"]')
    # Peer bubble shows the decrypted text on the receiving side
    page_to.wait_for_selector(f"text={text}", timeout=timeout)


@pytest.fixture(scope="module")
def happy_stack():
    stack = GUIStack("happy")
    stack.start()
    time.sleep(0.3)
    yield stack
    stack.stop()


@pytest.fixture(scope="module")
def mitm_stack():
    stack = GUIStack("mitm", rewrite_pubkeys=True)
    stack.start()
    time.sleep(0.3)
    yield stack
    stack.stop()


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=LAUNCH_ARGS)
        yield b
        b.close()


class TestTwoUserGUIChat:
    def test_two_anonymous_users_chat_via_shared_link(self, happy_stack, browser):
        """Full GUI journey: room creation, shared link, handshake, verified chat."""
        ctx_a = browser.new_context()
        ctx_b = browser.new_context()
        page_a = ctx_a.new_page()
        page_b = ctx_b.new_page()

        frames_a = _capture_ws_frames(page_a)
        frames_b = _capture_ws_frames(page_b)

        # User A creates a room (auto-navigates to the room screen)
        invite_link = _create_room(page_a, happy_stack.base_url, happy_stack.ws_url)
        assert "/room/" in invite_link and "#" in invite_link

        # User B opens the shared link (anonymous, separate browser context)
        _join_room(page_b, invite_link, happy_stack.ws_url)

        # Both sides reach mutual key confirmation
        page_a.wait_for_selector('text=Confirmed (2/2)', timeout=30000)
        page_b.wait_for_selector('text=Confirmed (2/2)', timeout=30000)

        # SAS must be identical on both screens (XBF-MKC cross-bound transcript)
        code_a, emojis_a = _read_sas_code(page_a)
        code_b, emojis_b = _read_sas_code(page_b)
        assert code_a == code_b and len(code_a) == 6
        assert emojis_a == emojis_b

        # Bidirectional encrypted chat
        secret_msg_b = "TOP-SECRET-FROM-B-918273"
        _send_and_expect(page_b, page_a, secret_msg_b)
        secret_msg_a = "TOP-SECRET-FROM-A-556677"
        _send_and_expect(page_a, page_b, secret_msg_a)

        # Zero-knowledge proof: no plaintext ever left either browser
        all_sent = "\n".join(frames_a + frames_b)
        assert secret_msg_a not in all_sent
        assert secret_msg_b not in all_sent
        assert "encrypted_payload" in all_sent
        # Room secret fragment never appears in WS traffic either
        fragment = invite_link.split("#", 1)[1]
        assert fragment not in all_sent

        ctx_a.close()
        ctx_b.close()

    def test_mitm_detected_in_gui_and_messaging_blocked(self, mitm_stack, browser):
        """Active key-substitution MITM must surface alerts on both screens."""
        ctx_a = browser.new_context()
        ctx_b = browser.new_context()
        page_a = ctx_a.new_page()
        page_b = ctx_b.new_page()

        invite_link = _create_room(page_a, mitm_stack.base_url, mitm_stack.ws_url)
        _join_room(page_b, invite_link, mitm_stack.ws_url)

        # Both sides must hit the cryptographic hard-fail
        page_a.wait_for_selector('[data-testid="mitm-alert"]', timeout=30000)
        page_b.wait_for_selector('[data-testid="mitm-alert"]', timeout=30000)

        # SAS screens must show DIVERGENT codes (visibly different fingerprints)
        page_a.click('[data-testid="verify-sas-btn"]')
        page_b.click('[data-testid="verify-sas-btn"]')
        page_a.wait_for_selector('[data-testid="sas-code"]')
        page_b.wait_for_selector('[data-testid="sas-code"]')
        code_a = re.sub(r"\s+", "", page_a.inner_text('[data-testid="sas-code"]'))
        code_b = re.sub(r"\s+", "", page_b.inner_text('[data-testid="sas-code"]'))
        assert code_a != code_b, "SAS codes must differ when a MITM rewrites keys"

        # Close modals; messaging must be disabled on both sides
        for page in (page_a, page_b):
            page.keyboard.press("Escape")
            page.wait_for_selector('[data-testid="chat-input"]')
            assert page.is_disabled('[data-testid="chat-input"]')
            placeholder = page.get_attribute('[data-testid="chat-input"]', "placeholder") or ""
            assert "disabled" in placeholder.lower()

        ctx_a.close()
        ctx_b.close()
