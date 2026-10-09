# TeraBox Coin Collector Extension

<p align="center">
  <img src="https://lh3.googleusercontent.com/XYKN1D9li5yEPEkDN-tqDGvfhl3_wrW6eTe1zqQACZEGDxiFSmVPjokPY4ZomDojvruK06d1GtbZfhBckTR55Nbp=s120" alt="TeraBox Coin Collector Logo" width="120"/>
</p>

<h2 align="center">🚀 Unleash Infinite Cloud Storage! 🌟</h2>

<p align="center">
  <strong>Collect coins from TeraBox and get unlimited free cloud storage and premium on TeraBox</strong>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/terabox-coin-collector/hbekcbjbdkcoggmjnpnffioipgadlkfl">
    <img src="https://img.shields.io/badge/Chrome-Add%20to%20Browser-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Add to Chrome">
  </a>
</p>

> **Status (personal use, unpublished):** This fork is maintained for personal use only. It is no longer listed on the Chrome Web Store. It automates an undocumented TeraBox game API, so TeraBox's endpoints may change at any time and the extension may stop working without notice. Use it on your own account only, and at your own risk.

## 🌟 Overview

The TeraBox Coin Collector is an unofficial browser extension designed to simplify the process of collecting coins on TeraBox, allowing users to potentially earn unlimited free cloud storage and premium features daily.

### 🎁 Benefits:

- 📦 **5TB FREE Storage EVERY DAY!** 🔄
- ⚡ **Lightning-Fast 50MB/s+ Uploads**
- 🔑 **2 Years Premium DAILY!**

Join thousands of happy users enjoying:

| Feature | Description |
|---------|-------------|
| 🌈 | Unlimited file sharing |
| 📸 | Endless photo backups |
| 🎥 | Infinite video storage |
| 📚 | Limitless document space |

> Why pay for cloud storage when you can get it FREE? 💰💸

## 🚀 Features

- One-click coin collection
- Potential to earn up to 5TB of free cloud storage daily
- Opportunity to gain 2 years of free premium access every day
- Access to fast upload speeds (50MB/s+)

## 🛠️ Development

The extension lives in `source code/Terabox Extension/`. Its logic is split into testable modules under `lib/`:

- `lib/api.js`: HTTP client with retry on transient errors only (network, 429, 5xx).
- `lib/collector.js`: the collection state machine, with stop on daily limit or repeated failures.
- `lib/logger.js`: bounded log stored in `chrome.storage`.

Run the tests (Node 20+, no dependencies):

```bash
npm test
```

Load it in Chrome: open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `source code/Terabox Extension`.

## 🔧 How to Get Started

1. Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/terabox-coin-collector/hbekcbjbdkcoggmjnpnffioipgadlkfl).
2. Click the "Sign Up" button on the extension.
3. Sign up for TeraBox on the page that opens.
4. Start collecting coins automatically!
5. Download the TeraBox mobile app.
6. Redeem your coins in the app for MASSIVE storage! 📱💎

### ⚠️ Important Note

If you encounter an error like "integrala not found," please try the following:

- **Collect 9 coins manually** first using the TeraBox mobile app.
- **Clear your browser cookies** and attempt to sign up for a new TeraBox account using the "Sign Up" button of the extension.

## 📜 Legal Notice

This extension is provided "as is" without any warranties. Users are responsible for ensuring their use of this extension complies with TeraBox's terms of service. The developers of this extension are not responsible for any changes in TeraBox's policies or any consequences resulting from the use of this extension.

## 🔒 Privacy

This extension does not collect or store any personal data. It only interacts with the TeraBox website to collect coins on your behalf when you initiate the process.

## 🆘 Support

For support or inquiries, please contact Lomusire at [supershadowcube@gmail.com](mailto:supershadowcube@gmail.com).

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Lomusire/unlimited-cloud-storage&type=Date)](https://star-history.com/#Lomusire/unlimited-cloud-storage&Date)

---

<p align="center">
  Remember to use this extension responsibly and in accordance with TeraBox's terms of service.
</p>

<p align="center">
  Enjoy your expanded cloud storage and premium features! 👋💾
</p>

<p align="center">
  #InfiniteStorage #FreeCloud #UnlimitedBackup
</p>

---

> **Disclaimer:** This extension is an independent project and is not affiliated with, endorsed by, or in any way officially connected with TeraBox or Flextech, Inc. TERABOX is a trademark of Flextech, Inc. Use of this trademark does not imply any affiliation with or endorsement by Flextech, Inc.
