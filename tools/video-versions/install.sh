#!/bin/zsh
#
# install.sh — installerer Finder-Quick Action'en "Flai Videoversioner".
#
#   zsh tools/video-versions/install.sh
#
# Højreklik en videofil i Finder → Hurtighandlinger → Flai Videoversioner.
# Kan køres igen når som helst (opdaterer scriptet og genskaber Quick Action).

set -eu
HERE=${0:A:h}
DEST="$HOME/Library/Application Support/FlaiVideoVersions"
WF="$HOME/Library/Services/Flai Videoversioner.workflow"

if ! command -v ffmpeg >/dev/null 2>&1 && [[ ! -x /opt/homebrew/bin/ffmpeg && ! -x /usr/local/bin/ffmpeg ]]; then
  print "⚠️  ffmpeg ikke fundet. Installer med: brew install ffmpeg" >&2
fi

mkdir -p "$DEST"
cp "$HERE/flai-video-versions.sh" "$DEST/flai-video-versions.sh"
chmod +x "$DEST/flai-video-versions.sh"

rm -rf "$WF"
mkdir -p "$WF/Contents"

cat > "$WF/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>NSActionTemplate</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>Flai Videoversioner</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict>
				<key>NSApplicationIdentifier</key>
				<string>com.apple.finder</string>
			</dict>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.movie</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
PLIST

cat > "$WF/Contents/document.wflow" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
<key>AMApplicationBuild</key>
<string>523</string>
<key>AMApplicationVersion</key>
<string>2.10</string>
<key>AMDocumentVersion</key>
<string>2</string>
<key>actions</key>
<array>
<dict>
<key>action</key>
<dict>
<key>AMAccepts</key>
<dict>
<key>Container</key>
<string>List</string>
<key>Optional</key>
<true/>
<key>Types</key>
<array>
<string>com.apple.cocoa.string</string>
</array>
</dict>
<key>AMActionVersion</key>
<string>2.0.3</string>
<key>AMApplication</key>
<array>
<string>Automator</string>
</array>
<key>AMProvides</key>
<dict>
<key>Container</key>
<string>List</string>
<key>Types</key>
<array>
<string>com.apple.cocoa.string</string>
</array>
</dict>
<key>ActionBundlePath</key>
<string>/System/Library/Automator/Run Shell Script.action</string>
<key>ActionName</key>
<string>Run Shell Script</string>
<key>ActionParameters</key>
<dict>
<key>COMMAND_STRING</key>
<string>/bin/zsh "$HOME/Library/Application Support/FlaiVideoVersions/flai-video-versions.sh" "$@"</string>
<key>CheckedForUserDefaultShell</key>
<true/>
<key>inputMethod</key>
<integer>1</integer>
<key>shell</key>
<string>/bin/zsh</string>
<key>source</key>
<string></string>
</dict>
<key>BundleIdentifier</key>
<string>com.apple.RunShellScript</string>
<key>CFBundleVersion</key>
<string>2.0.3</string>
<key>CanShowSelectedItemsWhenRun</key>
<false/>
<key>CanShowWhenRun</key>
<true/>
<key>Category</key>
<array>
<string>AMCategoryUtilities</string>
</array>
<key>Class Name</key>
<string>RunShellScriptAction</string>
<key>InputUUID</key>
<string>__IN__</string>
<key>OutputUUID</key>
<string>__OUT__</string>
<key>UUID</key>
<string>__ID__</string>
<key>UnlocalizedApplications</key>
<array>
<string>Automator</string>
</array>
<key>arguments</key>
<dict/>
<key>isViewVisible</key>
<true/>
<key>location</key>
<string>309.000000:253.000000</string>
</dict>
<key>isViewVisible</key>
<true/>
</dict>
</array>
<key>connectors</key>
<dict/>
<key>workflowMetaData</key>
<dict>
<key>serviceInputTypeIdentifier</key>
<string>com.apple.Automator.fileSystemObject</string>
<key>serviceOutputTypeIdentifier</key>
<string>com.apple.Automator.nothing</string>
<key>serviceProcessesInput</key>
<integer>0</integer>
<key>workflowTypeIdentifier</key>
<string>com.apple.Automator.servicesMenu</string>
</dict>
</dict>
</plist>
PLIST

sed -i '' \
  -e "s/__IN__/$(uuidgen)/" -e "s/__OUT__/$(uuidgen)/" -e "s/__ID__/$(uuidgen)/" \
  "$WF/Contents/document.wflow"

plutil -lint "$WF/Contents/Info.plist" "$WF/Contents/document.wflow"
# Finder viser kun en Quick Action i højreklik-menuen, når systemet har en visningsindstilling
# for den (det samme som at sætte hak under System Settings → Extensions → Finder).
# PlistBuddy bruges, fordi nøglen starter med "(" og `defaults` tolker den som en liste.
PB=/usr/libexec/PlistBuddy
PBS="$HOME/Library/Preferences/pbs.plist"
KEY="(null) - Flai Videoversioner - runWorkflowAsService"
KEYP=${KEY// /\\ }
if [[ -x $PB ]]; then
  $PB -c "Add :NSServicesStatus dict" "$PBS" >/dev/null 2>&1 || true
  $PB -c "Delete :NSServicesStatus:$KEYP" "$PBS" >/dev/null 2>&1 || true
  $PB -c "Add :NSServicesStatus:$KEYP dict" "$PBS" >/dev/null 2>&1 || true
  $PB -c "Add :NSServicesStatus:$KEYP:presentation_modes dict" "$PBS" >/dev/null 2>&1 || true
  for m in ContextMenu FinderPreview ServicesMenu; do
    $PB -c "Add :NSServicesStatus:$KEYP:presentation_modes:$m bool true" "$PBS" >/dev/null 2>&1 || true
  done
  killall cfprefsd >/dev/null 2>&1 || true
fi
/System/Library/CoreServices/pbs -flush >/dev/null 2>&1 || true
/System/Library/CoreServices/pbs -update >/dev/null 2>&1 || true

print "✅ Installeret:"
print "   Script:       $DEST/flai-video-versions.sh"
print "   Quick Action: $WF"
print "   Brug: højreklik en video i Finder → Hurtighandlinger → Flai Videoversioner"
print "   (Mangler den stadig i menuen: genstart Finder med  killall Finder  eller sæt hak under System Settings → Extensions → Finder.)"
