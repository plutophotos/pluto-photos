; ──────────────────────────────────────────────────
; Pluto Photos — Custom NSIS Installer Script
; ──────────────────────────────────────────────────

; Branding text at bottom of every installer page
BrandingText "Pluto Photos v${VERSION} — plutophotos.com"

; ── Override common.nsh "nevershow" — runs AFTER common.nsh ──
!macro customHeader
  ShowInstDetails show
  ShowUnInstDetails show
!macroend

; ── Welcome page — tells user what they're installing ──
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Pluto Photos v${VERSION} Setup"
  !define MUI_WELCOMEPAGE_TEXT "Pluto Photos is a powerful desktop photo library manager with \
face detection, smart albums, photo editing, map view, and more.$\r$\n$\r$\n\
  - 100% offline - your photos never leave your computer$\r$\n\
  - AI-powered face detection & background removal$\r$\n\
  - Smart albums, tags, ratings & color labels$\r$\n\
  - Built-in photo & video editor$\r$\n\
  - Google Photos import$\r$\n$\r$\n\
Publisher: Pluto Photos (plutophotos.com)$\r$\n$\r$\n\
Click Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── Installation progress — print status to the details pane ──
; electron-builder extracts a single 7z archive via Nsis7z::Extract which
; does not emit per-file DetailPrint lines, so the details box stays empty.
; This macro runs AFTER extraction and adds visible progress messages.
!macro customInstall
  DetailPrint "Installing Pluto Photos v${VERSION}..."
  DetailPrint ""
  DetailPrint "Extracting application files..."
  DetailPrint "  ├─ Electron runtime"
  DetailPrint "  ├─ Pluto Photos application"
  DetailPrint "  ├─ Sharp image processing library"
  DetailPrint "  ├─ SQLite database engine"
  DetailPrint "  ├─ FFmpeg video/audio encoder"
  DetailPrint "  ├─ ONNX AI runtime"
  DetailPrint "  └─ AI models (face detection, background removal, captions)"
  DetailPrint ""
  DetailPrint "Registering file associations..."
  DetailPrint "  ├─ .jpg, .jpeg, .png, .webp, .gif"
  DetailPrint "  ├─ .heic, .heif, .tiff, .tif, .bmp"
  DetailPrint "  └─ .cr2, .nef, .arw, .dng (RAW formats)"
  DetailPrint ""
  DetailPrint "Creating shortcuts..."
  DetailPrint "  ├─ Desktop shortcut"
  DetailPrint "  └─ Start Menu entry"
  DetailPrint ""
  DetailPrint "Installation complete."
  DetailPrint "──────────────────────────────────────"
  DetailPrint "Install location: $INSTDIR"
  DetailPrint "Version: ${VERSION}"
  DetailPrint ""
  DetailPrint "Visit plutophotos.com for help & updates."
!macroend

; ── Finish page — confirm success and offer to launch ──
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Pluto Photos Installed Successfully!"
  !define MUI_FINISHPAGE_TEXT "Pluto Photos v${VERSION} has been installed on your computer.$\r$\n$\r$\n\
Your photo library, albums, and settings are stored locally on your device.$\r$\n\
Visit plutophotos.com for help, updates, and Pro features."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_LINK "Visit plutophotos.com"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://plutophotos.com"
  !insertmacro MUI_PAGE_FINISH
!macroend

; ── Confirm before uninstalling ──
!macro customUnInit
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
    "Uninstall Pluto Photos v${VERSION}?$\r$\n$\r$\n\
    Your photos, library database, and files on disk will NOT be deleted.$\r$\n\
    Only the application itself will be removed." \
    IDOK +2
    Abort
!macroend

; ── Custom uninstall steps ──
!macro customUnInstall
  DetailPrint ""
  DetailPrint "Removing Pluto Photos..."
  DetailPrint "Your photos and library data are safe — they remain on disk."
  DetailPrint ""
!macroend
