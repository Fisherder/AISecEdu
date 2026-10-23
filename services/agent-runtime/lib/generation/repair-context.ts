export function compactRepairFailureHistory(correction:string, failures:Array<{attempt:number;issue:string}>) {
  const previous=new Map<string,number>();
  return failures.map(failure=>{
    const repeated=previous.get(failure.issue);
    if(repeated!==undefined)return {attempt:failure.attempt,sameIssueAsAttempt:repeated};
    previous.set(failure.issue,failure.attempt);
    let length=0;
    while(length<correction.length && length<failure.issue.length && correction[length]===failure.issue[length])length++;
    return length>=256 ? {attempt:failure.attempt,correctionPrefixLength:length,issueSuffix:failure.issue.slice(length)} : failure;
  });
}

export const REPAIR_HISTORY_REFERENCE_BRIEF='recentFailures中的correctionPrefixLength表示原诊断为correction前N个字符加issueSuffix；sameIssueAsAttempt表示与该历史轮次诊断相同。这是无损去重，没有删除错误信息，不需要重新执行已成功步骤。';
