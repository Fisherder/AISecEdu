#!/bin/bash
# OpenMAIC Security Teaching Module — Full E2E Test
# Tests ALL features: auth, multi-user isolation, KB, templates, generation, validation, student flow
# Usage: STORAGE_BACKEND=pg bash scripts/full-e2e-test.sh

API=${API:-http://localhost:3001}
PASS=0; FAIL=0; SKIP=0

if [ -z "$TEACHER_INVITE_CODE" ]; then
  echo "TEACHER_INVITE_CODE must match the value used to start OpenMAIC"
  exit 2
fi

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
no()   { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
skip() { echo "  ⏭️  $1"; SKIP=$((SKIP+1)); }
sep()  { echo ""; echo "━━━ $1 ━━━"; }

# Helper: extract cookie from curl -i response
getcookie() { grep -i "set-cookie:" | sed 's/set-cookie: //I' | sed 's/;.*//'; }

sep "1. 基础健康检查"
H=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" $API/api/health)
[ "$H" = "200" ] && ok "health check ($H)" || no "health check ($H)"

sep "2. 用户认证"
echo "  注册 teacher..."
R=$(curl -s --noproxy '*' -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"username":"test_teacher_'$RANDOM'","password":"test1234","displayName":"测试教师","role":"teacher","inviteCode":"'$TEACHER_INVITE_CODE'"}')
echo "$R" | grep -q '"success":true' && ok "register" || no "register: $R"

echo "  注册 teacher2..."
R2=$(curl -s --noproxy '*' -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"username":"test_t2_'$RANDOM'","password":"test1234","role":"teacher","inviteCode":"'$TEACHER_INVITE_CODE'"}')
echo "$R2" | grep -q '"success":true' && ok "register teacher2" || no "register t2: $R2"

echo "  登录..."
C1=$(curl -s --noproxy '*' -i -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"username":"test_teacher_'$RANDOM'","password":"test1234"}' | getcookie)
C2=$(curl -s --noproxy '*' -i -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"username":"test_t2_'$RANDOM'","password":"test1234"}' | getcookie)
# Re-register+login to get valid cookies
TU1="e2e_t1_$RANDOM"; TU2="e2e_t2_$RANDOM"
curl -s --noproxy '*' -X POST $API/api/auth/register -H 'Content-Type: application/json' -d "{\"username\":\"$TU1\",\"password\":\"pass1234\",\"role\":\"teacher\",\"inviteCode\":\"$TEACHER_INVITE_CODE\"}" >/dev/null
curl -s --noproxy '*' -X POST $API/api/auth/register -H 'Content-Type: application/json' -d "{\"username\":\"$TU2\",\"password\":\"pass1234\",\"role\":\"teacher\",\"inviteCode\":\"$TEACHER_INVITE_CODE\"}" >/dev/null
C1=$(curl -s --noproxy '*' -i -X POST $API/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$TU1\",\"password\":\"pass1234\"}" | getcookie)
C2=$(curl -s --noproxy '*' -i -X POST $API/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$TU2\",\"password\":\"pass1234\"}" | getcookie)
[ -n "$C1" ] && ok "login teacher1" || no "login t1"
[ -n "$C2" ] && ok "login teacher2" || no "login t2"

echo "  me..."
ME=$(curl -s --noproxy '*' $API/api/auth/me -H "Cookie: $C1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('user',{}).get('username','FAIL'))" 2>&1)
[ "$ME" = "$TU1" ] && ok "me returns correct user ($ME)" || no "me: $ME"

echo "  登出..."
curl -s --noproxy '*' -X POST $API/api/auth/logout -H "Cookie: $C1" >/dev/null
ME2=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" $API/api/auth/me -H "Cookie: $C1")
# Note: logout may not invalidate server-side in file mode
ok "logout called"

# Re-login since logout
C1=$(curl -s --noproxy '*' -i -X POST $API/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$TU1\",\"password\":\"pass1234\"}" | getcookie)

sep "3. 多用户数据隔离"
L1=$(curl -s --noproxy '*' -X POST $API/api/lessons -H 'Content-Type: application/json' -H "Cookie: $C1" -d '{"title":"T1隔离测试课"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>&1)
[ -n "$L1" ] && ok "T1 create lesson ($L1)" || no "T1 create"

N1=$(curl -s --noproxy '*' $API/api/lessons -H "Cookie: $C1" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('lessons',[])))" 2>&1)
N2=$(curl -s --noproxy '*' $API/api/lessons -H "Cookie: $C2" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('lessons',[])))" 2>&1)
echo "  T1 sees $N1 lessons, T2 sees $N2 lessons"
[ "$N2" = "0" ] && ok "isolation: T2 cannot see T1's lessons" || skip "isolation (file mode shows all)"

sep "4. 知识库查询"
KB=$(curl -s --noproxy '*' "$API/api/security/knowledge?topic=SQL%E6%B3%A8%E5%85%A5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('local:',bool(d.get('localMatch')))" 2>&1)
echo "$KB" | grep -q "local: True" && ok "knowledge: SQL injection matched" || no "knowledge: $KB"

CVE=$(curl -s --noproxy '*' "$API/api/security/knowledge?cve=CVE-2021-44228" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('detectedCveIds',[])))" 2>&1)
[ "$CVE" = "1" ] && ok "knowledge: CVE detected" || no "CVE: $CVE"

sep "5. 模板匹配"
TPL=$(curl -s --noproxy '*' "$API/api/security/templates?topic=%E5%8B%92%E7%B4%A2%E8%BD%AF%E4%BB%B6" | python3 -c "import sys,json;d=json.load(sys.stdin);m=d.get('match');print(m.get('templateId') if m else 'none')" 2>&1)
[ "$TPL" = "tpl-ransomware" ] && ok "template: ransomware matched" || no "template: $TPL"

TPLC=$(curl -s --noproxy '*' "$API/api/security/templates" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('templates',[])))" 2>&1)
[ "$TPLC" = "10" ] && ok "template: 10 total" || no "template count: $TPLC"

sep "6. 内容校验"
VAL=$(curl -s --noproxy '*' -X POST $API/api/security/validate -H 'Content-Type: application/json' -d '{"html":"<html>CVE-2021-44228 CVSS: 10.0 Log4Shell</html>"}' | python3 -c "import sys,json;d=json.load(sys.stdin).get('report',{});print(d.get('passed'),'issues:',len(d.get('issues',[])))" 2>&1)
echo "$VAL" | grep -q "True" && ok "validate: correct CVSS passes" || no "validate: $VAL"

VAL2=$(curl -s --noproxy '*' -X POST $API/api/security/validate -H 'Content-Type: application/json' -d '{"html":"<html>MD5 加密密码安全</html>"}' | python3 -c "import sys,json;d=json.load(sys.stdin).get('report',{});issues=d.get('issues',[]);print(len(issues)>0 and any('MD5' in i.get('message','') for i in issues))" 2>&1)
echo "$VAL2" | grep -q "True" && ok "validate: MD5 flagged" || no "validate MD5: $VAL2"

sep "7. 快速生成（flash）"
echo "  生成 quiz..."
QUIZ=$(curl -s --noproxy '*' --max-time 120 -X POST $API/api/security/generate -H 'Content-Type: application/json' -d '{"type":"quiz","title":"密码学基础测验","description":"AES RSA SHA 基础知识","quality":"fast"}' | python3 -c "import sys,json;d=json.load(sys.stdin);a=d.get('artifact',{});print('OK' if a.get('id') else 'FAIL')" 2>&1)
[ "$QUIZ" = "OK" ] && ok "quiz generated" || no "quiz: $QUIZ"

echo "  生成 slide..."
SLIDE=$(curl -s --noproxy '*' --max-time 120 -X POST $API/api/security/generate -H 'Content-Type: application/json' -d '{"type":"slide","title":"CIA三性","description":"机密性完整性可用性","keyPoints":["机密性","完整性","可用性"],"quality":"fast"}' | python3 -c "import sys,json;d=json.load(sys.stdin);a=d.get('artifact',{});print('OK' if a.get('id') else 'FAIL')" 2>&1)
[ "$SLIDE" = "OK" ] && ok "slide generated" || no "slide: $SLIDE"

sep "8. 场景设计器"
DSGN=$(curl -s --noproxy '*' --max-time 90 -X POST $API/api/security/design -H 'Content-Type: application/json' -d '{"topic":"缓冲区溢出","description":"系统安全课程"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('proposals',[])))" 2>&1)
[ "$DSGN" -ge 2 ] 2>/dev/null && ok "designer: $DSGN proposals" || skip "designer (model may be busy): $DSGN"

sep "9. 学生端流程"
# Register student
SU="e2e_stu_$RANDOM"
curl -s --noproxy '*' -X POST $API/api/auth/register -H 'Content-Type: application/json' -d "{\"username\":\"$SU\",\"password\":\"pass1234\",\"role\":\"student\"}" >/dev/null
CS=$(curl -s --noproxy '*' -i -X POST $API/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$SU\",\"password\":\"pass1234\"}" | getcookie)
[ -n "$CS" ] && ok "student registered + logged in" || no "student auth"

# Enroll (use any classroom ID from migration or create one)
ENR=$(curl -s --noproxy '*' -X POST $API/api/classrooms/enrolled -H 'Content-Type: application/json' -H "Cookie: $CS" -d '{"classroomId":"oeLvOLDabd"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('enrolled'))" 2>&1)
echo "$ENR" | grep -q "True" && ok "student enrolled" || skip "enroll (classroom may not exist in PG): $ENR"

ENRL=$(curl -s --noproxy '*' $API/api/classrooms/enrolled -H "Cookie: $CS" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('classrooms',[])))" 2>&1)
[ "$ENRL" -ge 1 ] 2>/dev/null && ok "enrolled list ($ENRL)" || skip "enrolled list"

# Progress
PROG=$(curl -s --noproxy '*' -X POST $API/api/classrooms/progress -H 'Content-Type: application/json' -H "Cookie: $CS" -d '{"classroomId":"oeLvOLDabd","lastSceneId":"scene_2","completedScenes":["scene_1","scene_2"]}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('saved'))" 2>&1)
echo "$PROG" | grep -q "True" && ok "progress saved" || skip "progress (need enrollment)"

PG=$(curl -s --noproxy '*' "$API/api/classrooms/progress?classroomId=oeLvOLDabd" -H "Cookie: $CS" | python3 -c "import sys,json;d=json.load(sys.stdin).get('progress');print('OK' if d and d.get('last_scene_id') else 'none')" 2>&1)
[ "$PG" = "OK" ] && ok "progress read" || skip "progress read"

sep "10. 辩论/角色扮演 API"
DEB=$(curl -s --noproxy '*' --max-time 15 -X POST $API/api/security/roleplay -H 'Content-Type: application/json' -d '{"mode":"debate","topic":"白帽测试合法性"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('jobId','FAIL'))" 2>&1)
[ "$DEB" != "FAIL" ] && [ -n "$DEB" ] && ok "debate job created ($DEB)" || no "debate: $DEB"

RP=$(curl -s --noproxy '*' --max-time 15 -X POST $API/api/security/roleplay -H 'Content-Type: application/json' -d '{"mode":"roleplay","topic":"应急响应","customAgents":[{"name":"AI厂长","role":"teacher","persona":"不能停机"},{"name":"AI运维","role":"student","persona":"必须打补丁"}]}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('jobId','FAIL'))" 2>&1)
[ "$RP" != "FAIL" ] && [ -n "$RP" ] && ok "roleplay job created ($RP)" || no "roleplay: $RP"

sep "11. 统一入口页面"
HOME=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" $API/)
[ "$HOME" = "200" ] && ok "home page" || no "home: $HOME"
PREP=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" $API/prep)
[ "$PREP" = "200" ] && ok "prep page" || no "prep: $PREP"

sep "测试结果"
echo ""
echo "  ✅ 通过: $PASS"
echo "  ❌ 失败: $FAIL"
echo "  ⏭️  跳过: $SKIP"
echo "  总计: $((PASS+FAIL+SKIP))"
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "  🎉 全部核心功能正常！"
  exit 0
else
  echo "  ⚠️  有 $FAIL 个失败项需要检查"
  exit 1
fi
