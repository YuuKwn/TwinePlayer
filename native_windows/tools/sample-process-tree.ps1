param([Parameter(Mandatory)][int]$RootProcessId,[switch]$Gpu)
$ErrorActionPreference='Stop'
$all=@(Get-CimInstance Win32_Process)
$ids=[Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($RootProcessId)
do { $added=$false; foreach($item in $all){if($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)){$added=$true}} } while($added)
$items=@(foreach($taskId in $ids){$process=Get-Process -Id $taskId -ErrorAction SilentlyContinue; if($process){[ordered]@{pid=$taskId;name=$process.ProcessName;cpuSeconds=$process.TotalProcessorTime.TotalSeconds;workingSetBytes=$process.WorkingSet64;privateBytes=$process.PrivateMemorySize64}}})
$engines=@(); $gpuStatus='not-sampled'
if($Gpu){
    try{
        $samples=Get-Counter -Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples 2 -ErrorAction Stop
        $engines=@(foreach($sample in $samples.CounterSamples){if($sample.InstanceName -match 'pid_(\d+).*engtype_(.+)' -and $ids.Contains([int]$Matches[1])){[ordered]@{pid=[int]$Matches[1];engine=$Matches[2];utilizationPercent=$sample.CookedValue}}})
        $gpuStatus='sampled-per-process-engine; not whole-GPU aggregate'
    }catch{$gpuStatus='unavailable: '+$_.Exception.GetType().Name}
}
[ordered]@{logicalProcessors=[Environment]::ProcessorCount;processes=$items;gpuStatus=$gpuStatus;gpuEngines=$engines} | ConvertTo-Json -Depth 5 -Compress
