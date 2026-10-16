#!/bin/bash
export PATH="$HOME/.local/node/bin:$PATH"
exec npm --prefix /Users/sam/Downloads/FMRPG/app run preview -- --host --port 4173
