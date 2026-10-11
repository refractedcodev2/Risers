# Risers
Risers is a free platform where you can scan Roblox games, get estimated value for a buyout or a acquisition deal!

public/index.html            the site (works on its own too)
netlify/functions/snapshot   saves game stats every 10 minutes (Scheduled Function + Netlify Blobs)
netlify/functions/history    serves them to the page at /api/history

Deploy (drag and drop skips functions, so use one of these):

A. Git: push this folder to GitHub, then Netlify > Add new site > Import an existing project.
B. CLI:  npm install  then  npx netlify-cli deploy --prod   (first run asks you to log in and create a site)

The first snapshot lands within 10 minutes of deploying. Until then the page reads Roblox directly.
