!macro customInstall
  ; The installer runs with administrative privileges (perMachine: true).
  ; Any legacy task cleanup can happen here.
!macroend

!macro customUnInstall
  ; Delete the elevated scheduled task upon uninstallation
  ExecWait 'schtasks.exe /delete /tn "Qzyrium-clash-run" /f'
!macroend
