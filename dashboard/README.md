# grndwrk-mobile.html

This is the GRNDWRK mobile dashboard (v2 — full SevenRooms integration).

The file is too large to push via browser API injection. Please upload the `grndwrk-mobile.html` file manually via:

1. Go to https://github.com/TylerdeanB/grndwrk/upload/main/dashboard
2. Drag and drop `grndwrk-mobile.html`
3. Commit changes

Or via terminal:
```bash
cd ~/Downloads/grndwrk-repo
git clone https://github.com/TylerdeanB/grndwrk.git
cd grndwrk
mkdir -p dashboard api docs
cp path/to/grndwrk-mobile.html dashboard/
git add .
git commit -m "Add mobile dashboard v2"
git push
```