#!/usr/bin/env bash
# shellcheck disable=SC2089,SC2090  # MSG_* are printf format strings; the
# literal quotes inside them are intentional data, not shell quoting.
# i18n message catalog for the Makefile.
# Detects the system locale (LC_ALL > LC_MESSAGES > LANG) and exports MSG_*
# variables. Supported: pt (Portuguese/BR), es (Spanish), en (English, default).
# Any unrecognized locale falls back to English.
#
# Usage (from a Makefile recipe): source scripts/i18n.sh; echo "$MSG_..."
# Messages with placeholders use printf-style %s — call as:
#   printf "$MSG_VM_EXISTS\n" "$VM_NAME" "$status"

# Pick the first non-empty locale source, take the language prefix (xx).
_loc="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
LEASH_LANG="${_loc%%_*}"   # e.g. pt_BR.UTF-8 -> pt
LEASH_LANG="${LEASH_LANG%%.*}"  # e.g. C.UTF-8 -> C

case "$LEASH_LANG" in
  pt)
    MSG_VM_NONE="→ Nenhuma VM '%s'. Criando e subindo a stack…"
    MSG_VM_EXISTS="VM '%s' já existe (status: %s). O que fazer?"
    MSG_OPT_SHELL="Abrir shell no sandbox"
    MSG_OPT_UP="Subir stack (proxy+agents+falco)"
    MSG_OPT_UI="Abrir UI do proxy"
    MSG_OPT_DASHBOARD="Abrir dashboard (visualizar e gerenciar)"
    MSG_OPT_STOP="Parar VM"
    MSG_OPT_QUIT="Sair"
    MSG_QUITTING="Saindo."
    MSG_INVALID="Opção inválida."
    MSG_VM_CREATING="→ Criando VM Lima '%s'…"
    MSG_VM_STARTING="→ Iniciando VM Lima '%s' existente (estava %s)…"
    MSG_VM_RUNNING="→ VM Lima '%s' já está rodando."
    MSG_PROXY_UI="→ UI do proxy: http://localhost:8081 (rode 'make ui' para abrir)"
    ;;
  es)
    MSG_VM_NONE="→ No hay VM '%s'. Creando y levantando el stack…"
    MSG_VM_EXISTS="La VM '%s' ya existe (estado: %s). ¿Qué hacer?"
    MSG_OPT_SHELL="Abrir shell en el sandbox"
    MSG_OPT_UP="Levantar stack (proxy+agents+falco)"
    MSG_OPT_UI="Abrir UI del proxy"
    MSG_OPT_DASHBOARD="Abrir dashboard (ver y gestionar)"
    MSG_OPT_STOP="Detener VM"
    MSG_OPT_QUIT="Salir"
    MSG_QUITTING="Saliendo."
    MSG_INVALID="Opción inválida."
    MSG_VM_CREATING="→ Creando VM Lima '%s'…"
    MSG_VM_STARTING="→ Iniciando VM Lima '%s' existente (estaba %s)…"
    MSG_VM_RUNNING="→ La VM Lima '%s' ya está corriendo."
    MSG_PROXY_UI="→ UI del proxy: http://localhost:8081 (ejecuta 'make ui' para abrir)"
    ;;
  *)
    MSG_VM_NONE="→ No VM '%s'. Creating and bringing up the stack…"
    MSG_VM_EXISTS="VM '%s' already exists (status: %s). What do you want to do?"
    MSG_OPT_SHELL="Open a shell in the sandbox"
    MSG_OPT_UP="Bring up the stack (proxy+agents+falco)"
    MSG_OPT_UI="Open the proxy UI"
    MSG_OPT_DASHBOARD="Open the dashboard (view & manage)"
    MSG_OPT_STOP="Stop the VM"
    MSG_OPT_QUIT="Quit"
    MSG_QUITTING="Quitting."
    MSG_INVALID="Invalid option."
    MSG_VM_CREATING="→ Creating Lima VM '%s'…"
    MSG_VM_STARTING="→ Starting existing Lima VM '%s' (was %s)…"
    MSG_VM_RUNNING="→ Lima VM '%s' already running."
    MSG_PROXY_UI="→ Proxy UI: http://localhost:8081 (run 'make ui' to open)"
    ;;
esac

export MSG_VM_NONE MSG_VM_EXISTS MSG_OPT_SHELL MSG_OPT_UP MSG_OPT_UI \
  MSG_OPT_DASHBOARD MSG_OPT_STOP MSG_OPT_QUIT MSG_QUITTING MSG_INVALID \
  MSG_VM_CREATING MSG_VM_STARTING MSG_VM_RUNNING MSG_PROXY_UI
