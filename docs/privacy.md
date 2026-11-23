# Privacy

## Self-hosted Partsible

Self-hosted Partsible (Docker) contains no analytics. Its home page checks
GitHub's public API for the newest release number so it can show an update
notice. Like any web request, this exposes the visitor's IP address to GitHub,
but no account, project or usage data is sent. Your project data stays on your
server.

## Partsible Lite

[Partsible Lite](https://partsible.com/) runs in your browser. Your
projects are saved only in this browser on this device. They are never
uploaded. Clearing browser data deletes them, so export a backup if you want to
keep them.

## Hosting

Partsible Lite and this documentation site are served by Cloudflare Pages. Like
any web host, Cloudflare handles your IP address to deliver the pages. The
documentation site and the self-hosted app contain no analytics.

## Support link

Partsible Lite, the self-hosted app and these docs link to
[Ko-fi](https://ko-fi.com/nordstad), where you can support the project. The link
is a plain link: nothing is sent to Ko-fi until you click it, and Ko-fi has its
own privacy policy.

## Usage statistics

Only Partsible Lite uses [Umami Cloud](https://umami.is), a
privacy-focused analytics service. It uses no cookies, does not collect
personal information and does not follow you across websites.

**What we collect, and why.** Which pages and tools are opened, whether an
optimisation succeeded or failed, whether a project was saved or exported,
whether a link to the self-hosted version was clicked, and whether the calculation engine
failed, with the tool in use and the stage (starting up, calculating or
crashing), but never the error text. Umami also records your browser,
operating system, screen size, language and country. We use this only to learn which features are used
and what is broken, so we can improve Partsible.

**What we never collect.** Project names, measurements, uploaded files,
anything you type, your name or email address, or your IP address as a stored
value. Sizes are grouped into coarse ranges such as "6 to 20 parts", never
exact values. Lite has no accounts, so nothing can be linked to a person.

**Turn it off.** In [Partsible Lite](https://partsible.com/), select
**Turn off** next to **Analytics: on** in the footer. We also respect your browser's Do Not Track and Global Privacy
Control settings, and when either is set nothing is loaded at all.

The choice is stored only in your browser and is never sent anywhere. Clearing
browser data resets it.

**Retention.** Usage data is kept for up to six months. The provider is Umami
Software, Inc., and the data is stored in Umami Cloud's EU region.

**Contact.** Questions or requests about this page: open an issue on
[GitHub](https://github.com/nordstad/partsible/issues).
