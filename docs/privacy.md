# Privacy

## Self-hosted Planqer

Self-hosted Planqer (Docker) contains no analytics and sends nothing anywhere.
Your data stays on your server.

## The demo

The [demo](https://nordstad.github.io/Planqer/app/) runs in your browser. Your
projects are saved only in this browser on this device. They are never
uploaded. Clearing browser data deletes them, so export a backup if you want to
keep them.

## Usage statistics

The demo and this documentation site use [Umami Cloud](https://umami.is), a
privacy-focused analytics service. It uses no cookies, does not collect
personal information and does not follow you across websites.

**What we collect, and why.** Which pages and tools are opened, whether an
optimisation succeeded or failed, whether a project was saved or exported,
whether a "full version" link was clicked, and whether the calculation engine
could not start. Umami also records your browser, operating system, screen
size, language and country. We use this only to learn which features are used
and what is broken, so we can improve Planqer.

**What we never collect.** Project names, measurements, uploaded files,
anything you type, your name or email address, or your IP address as a stored
value. Sizes are grouped into coarse ranges such as "6 to 20 parts", never
exact values. The demo has no accounts, so nothing can be linked to a person.

**Your choices.** Switch analytics off at any time, here or from the demo's
footer. One choice covers the demo and these docs. We also respect your
browser's Do Not Track and Global Privacy Control settings, and when either is
set nothing is loaded at all.

<!-- markdownlint-disable MD033 -->
<p>
  <button type="button" class="md-button" data-analytics-toggle>Turn analytics off</button>
  <span data-analytics-status></span>
</p>
<!-- markdownlint-enable MD033 -->

The choice is stored only in your browser and is never sent anywhere. Clearing
browser data resets it.

**Retention.** Usage data is kept for up to six months. The provider is Umami
Software, Inc., and the data is stored in Umami Cloud's EU region.

**Contact.** Questions or requests about this page: open an issue on
[GitHub](https://github.com/nordstad/Planqer/issues).
