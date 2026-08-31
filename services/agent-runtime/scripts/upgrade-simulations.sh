#!/bin/bash
# Upgrade all simulation artifacts from fast→rich (pro) mode.
# Scans every lesson, finds simulation artifacts, regenerates in rich mode.
# Usage: bash scripts/upgrade-simulations.sh

API=http://localhost:3001
LOG=scripts/upgrade-simulations.log
> "$LOG"

echo "=== 模拟实验质量升级 (fast → rich/pro) ===" | tee -a "$LOG"
echo "开始: $(date)" | tee -a "$LOG"

# Get all lessons
LESSONS=$(curl -s --noproxy '*' "$API/api/lessons" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for l in d.get('lessons',[]):
    print(l['id'])
" 2>/dev/null)

TOTAL=0
UPGRADED=0

for lid in $LESSONS; do
  # Get lesson details, find simulation artifacts
  SIMS=$(curl -s --noproxy '*' "$API/api/lessons/$lid" | python3 -c "
import sys,json
d=json.load(sys.stdin)['lesson']
for a in d.get('artifacts',[]):
    if a['type']=='simulation':
        print(a['id']+'|'+a['title']+'|'+(a.get('outline',{}).get('description','') or a.get('title','')))
" 2>/dev/null)

  while IFS='|' read -r aid title desc; do
    [ -z "$aid" ] && continue
    TOTAL=$((TOTAL+1))
    echo "▶ 升级: $title (lesson=$lid)" | tee -a "$LOG"

    # Generate rich replacement
    RESULT=$(curl -s --noproxy '*' --max-time 600 -X POST "$API/api/lessons/$lid/artifacts" \
      -H 'Content-Type: application/json' \
      -d "{\"mode\":\"single\",\"type\":\"simulation\",\"quality\":\"rich\",\"title\":\"$title\",\"description\":\"$desc\"}" \
      2>/dev/null)

    NEWID=$(echo "$RESULT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('artifact',{}).get('id',''))" 2>/dev/null)
    NEWLEN=$(echo "$RESULT" | python3 -c "import sys,json;d=json.load(sys.stdin);a=d.get('artifact',{});c=a.get('content',{});print(len(c.get('html','')))" 2>/dev/null)

    if [ -n "$NEWID" ]; then
      # Delete old simulation
      curl -s --noproxy '*' -X DELETE "$API/api/lessons/$lid/artifacts/$aid" > /dev/null 2>&1
      UPGRADED=$((UPGRADED+1))
      echo "  ✓ ${NEWLEN:-?} bytes | new=$NEWID (old=$aid deleted)" | tee -a "$LOG"
    else
      echo "  ✗ failed (pro overloaded?)" | tee -a "$LOG"
    fi
  done <<< "$SIMS"
done

echo "" | tee -a "$LOG"
echo "=== 完成: $(date) ===" | tee -a "$LOG"
echo "总计: $TOTAL 个模拟实验, $UPGRADED 个升级成功" | tee -a "$LOG"
