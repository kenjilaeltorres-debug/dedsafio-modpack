; Keep the registered install location on upgrades. For older portable/SFX
; installations in the normal user locations, reuse that directory.
!macro customInit
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\community.dedsafio.launcher" "InstallLocation"
  ${If} $0 != ""
    IfFileExists "$0\Mantis Studio.exe" 0 +2
      StrCpy $INSTDIR "$0"
  ${Else}
    IfFileExists "$LOCALAPPDATA\Programs\Mantis Studio\Mantis Studio.exe" 0 +2
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Mantis Studio"
    IfFileExists "$LOCALAPPDATA\Mantis Studio\Mantis Studio.exe" 0 +2
      StrCpy $INSTDIR "$LOCALAPPDATA\Mantis Studio"
  ${EndIf}
  InitPluginsDir
  IfFileExists "$INSTDIR\launcher.config.json" 0 +2
    CopyFiles /SILENT "$INSTDIR\launcher.config.json" "$PLUGINSDIR\mantis-config-preserved.json"
!macroend

!macro customInstall
  IfFileExists "$PLUGINSDIR\mantis-config-preserved.json" 0 +2
    CopyFiles /SILENT "$PLUGINSDIR\mantis-config-preserved.json" "$INSTDIR\launcher.config.json"
!macroend
