# Habit Tracker: build your own Android APK

You do not need Android Studio. GitHub builds the APK for you, free, in about 5 to 8 minutes.

## Steps

1. Make a free account at github.com (skip if you have one).
2. Click **+ (top right) > New repository**. Name it `habit-tracker`, leave it Public, click **Create repository**.
3. Unzip this zip on a computer. On the new repo page click **uploading an existing file**, then drag in
   EVERYTHING from inside the unzipped folder (`www`, `assets`, `package.json`, `package-lock.json`,
   `capacitor.config.json`, `.github`, ...). Click **Commit changes**.
   - If the `.github` folder does not upload (it is hidden on Mac: press Cmd+Shift+. in Finder),
     click **Add file > Create new file**, type `.github/workflows/build.yml` as the name,
     paste in the contents of `build-workflow-copy.txt`, and commit.
4. Open the **Actions** tab. A run called "Build Android APK" starts by itself
   (click "I understand my workflows, enable them" if GitHub asks). Wait for the green check.
5. Go back to the repo's main page, click **Releases** on the right, open the newest one,
   and download **HabitTracker.apk**. Doing this in Chrome on your phone is easiest.
6. Tap the downloaded file. If Android says "install unknown apps", allow it for Chrome (or Files),
   then tap **Install**. If Play Protect warns about an unknown developer, choose
   **More details > Install anyway**. That warning appears because the app is for personal use and not on the Play Store.

## If the build fails

Open the failed run in the Actions tab, click the red step, and copy the last 30 lines of the log
so it can be fixed.

## Notes

- Habit data is stored inside the app on the phone. Uninstalling the app erases it.
- "Download" for reports opens the Android share sheet: pick Files/Drive to save the Excel sheet, or Excel/Sheets to open it.
