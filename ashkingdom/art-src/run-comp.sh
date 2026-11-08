#!/bin/bash
# $1=id $2=desc
cd /home/user/GosuTaro/ashkingdom
export NODE_USE_ENV_PROXY=1 OPENAI_API_KEY=proxy-injected
for t in 1 2; do timeout 400 node tools/gen-openai.mjs "$1" "$2" 2>&1 | grep -v -i warn && [ -f assets/heroines/$1/sheet_src.png ] && break; done
for t in 1 2; do timeout 400 node tools/gen-sd.mjs "$1" 2>&1 | grep -v -i warn && [ -f assets/heroines/$1/sd_row.png ] && break; done
