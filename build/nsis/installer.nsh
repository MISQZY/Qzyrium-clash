; Legacy releases registered a root startup task for each user's SID.
; Enumerate Windows profiles directly instead of parsing localized command output.
!macro removeLegacyStartupTasks
  Push $0
  Push $1
  StrCpy $0 0
  ${Do}
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList" $0
    ${If} $1 == ""
      ${ExitDo}
    ${EndIf}
    nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "Qzyrium-clash-Startup-$1" /f'
    IntOp $0 $0 + 1
  ${Loop}
  Pop $1
  Pop $0
!macroend

!macro customInstall
  ; The installer runs with administrative privileges (perMachine: true).
  nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "Qzyrium-clash-run" /f'
  !insertmacro removeLegacyStartupTasks
!macroend

!macro customUnInstall
  ExecWait '"$SYSDIR\schtasks.exe" /delete /tn "Qzyrium-clash-run-v2" /f'
  ExecWait '"$SYSDIR\schtasks.exe" /delete /tn "Qzyrium-clash-run" /f'
  !insertmacro removeLegacyStartupTasks
!macroend
