# electron-hang

## Purpose

This repo is a demo of a hang that I've been encountering running Electron tests on linux. The tests use electron-mocha to test various behaviors, resulting in opening and closing quite a few windows during the test run. However, this demo just uses Electron on its own to demonstrate the issue.

## How to run

I can reproduce this consistently running in the included Docker image.

* `$ docker pull bendemboski/electron-hang`
* `$ docker run -it bendemboski/electron-hang ./tentimes.sh yarn launch`

I have seen my electron-mocha tests fail running natively on Ubuntu 16.04 (no docker or virtualization), but I haven't yet been able to find the right characteristics to get this isolated demo app to demonstrate the issues outside of docker.

## Expected results

The demo will open a window, call `loadURL()` on it, and immediately close it `<window count>` times (defaults to 20 -- see below). In my experience, this won't always cause the hang immediately, but when run through the `./tentimes` script (i.e. run ten times in a row), it will reliably encounter the hang.

## Investigation

### Window count vs. run count

By default `yarn launch` spawns 20 windows. Running it once often doesn't run into the hang, but running it 10 times pretty much always does. However, running `yarn launch 1000` which spawns 1000 windows doesn't seem to run into the hang more often than just spawning 20 windows.

### strace -- futex ETIMEDOUT

I poked around a bit while things were hung (having launched with `docker run --cap-add SYS_PTRACE` to enable running `strace`), and here's what I found. Here are the running processes:

```
root@f321544af567:/electron-hang# ps x
  PID TTY      STAT   TIME COMMAND
    1 ?        Ss+    0:00 /bin/bash ./tentimes.sh yarn launch
    6 ?        S+     0:00 /bin/sh /usr/bin/yarn launch
   17 console  Sl+    0:00 node /usr/share/yarn/bin/yarn.js launch
   27 console  S+     0:00 sh -c xvfb-run --server-args="-screen 0 1024x768x24" electron .
   28 console  S+     0:00 /bin/sh /usr/bin/xvfb-run --server-args=-screen 0 1024x768x24 electron .
   39 ?        Sl+    0:00 Xvfb :99 -screen 0 1024x768x24 -nolisten tcp -auth /tmp/xvfb-run.GzxQqY/Xauthority
   46 console  Sl+    0:00 node /electron-hang/node_modules/.bin/electron .
   52 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron .
   54 console  S+     0:00 /electron-hang/node_modules/electron/dist/electron --type=zygote --no-sandbox
   76 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron --type=gpu-process --no-sandbox --supports-dual-gpus=false --gpu-driver-bug-workarounds=7,23,74 --disable-gl-extensions=GL_KHR
   80 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron --type=renderer --no-sandbox --primordial-pipe-token=90CAE9A9A052607434E4B1DB98B01783 --lang=en-US --app-path=/electron-hang -
   88 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron --type=renderer --no-sandbox --primordial-pipe-token=3C82B6C4123E0D474CD7103384F0A9D3 --lang=en-US --app-path=/electron-hang -
   95 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron --type=renderer --no-sandbox --primordial-pipe-token=9833514EAEBE1C6DD3CF65A99B2AD9D9 --lang=en-US --app-path=/electron-hang -
   99 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron --type=renderer --no-sandbox --primordial-pipe-token=781A1D182C5691CA6568DB222DDD79A7 --lang=en-US --app-path=/electron-hang -
  103 console  Sl+    0:00 /electron-hang/node_modules/electron/dist/electron --type=renderer --no-sandbox --primordial-pipe-token=E1307BA822DFBFB545B980B0F6B0DE46 --lang=en-US --app-path=/electron-hang -
  106 ?        S+     0:02 /electron-hang/node_modules/electron/dist/electron .
  107 ?        Ss     0:00 sh
  119 ?        S      0:00 bash
  166 ?        R+     0:00 ps x
```

I `strace`d process `106` and it was spewing this over and over:

```
root@f321544af567:/electron-hang# strace -ffp 106
Process 106 attached
restart_syscall(<... resuming interrupted call ...>) = -1 ETIMEDOUT (Connection timed out)
futex(0x5587f00, FUTEX_WAIT_PRIVATE, 2, {0, 1925684}) = -1 ETIMEDOUT (Connection timed out)
futex(0x5587f00, FUTEX_WAIT_PRIVATE, 2, {0, 10038468}) = -1 ETIMEDOUT (Connection timed out)
futex(0x5587f00, FUTEX_WAIT_PRIVATE, 2, {0, 15091195}) = -1 ETIMEDOUT (Connection timed out)
```

Process `106`'s parent is process `52`, so I'm guessing it's hung in between forking and execing a renderer process during a window open, but that's pure speculation.

In case it's at all interesting, here is the stack and status of process `106`, followed by `strace`s of all the other Electron processes:

```
root@f321544af567:/electron-hang# cat /proc/106/stack
[<0000000000000000>] futex_wait_queue_me+0xc1/0x108
[<0000000000000000>] futex_wait+0xf5/0x205
[<0000000000000000>] hrtimer_init+0xa2/0xa2
[<0000000000000000>] do_futex+0xd2/0x807
[<0000000000000000>] __seccomp_filter+0x79/0x21d
[<0000000000000000>] arch_local_irq_restore+0x2/0x8
[<0000000000000000>] read_hpet+0x8a/0xb8
[<0000000000000000>] SyS_futex+0xd1/0x153
[<0000000000000000>] do_syscall_64+0x5c/0x6c
[<0000000000000000>] entry_SYSCALL64_slow_path+0x25/0x25
[<0000000000000000>] 0xffffffffffffffff
```

```
root@f321544af567:/electron-hang# cat /proc/106/status
Name:	electron
Umask:	0022
State:	S (sleeping)
Tgid:	106
Ngid:	0
Pid:	106
PPid:	52
TracerPid:	0
Uid:	0	0	0	0
Gid:	0	0	0	0
FDSize:	128
Groups:	 
NStgid:	106
NSpid:	106
NSpgid:	1
NSsid:	1
VmPeak:	 1055944 kB
VmSize:	 1055944 kB
VmLck:	       0 kB
VmPin:	       0 kB
VmHWM:	   19204 kB
VmRSS:	   19204 kB
RssAnon:	   16340 kB
RssFile:	    2864 kB
RssShmem:	       0 kB
VmData:	  200616 kB
VmStk:	     136 kB
VmExe:	   78436 kB
VmLib:	   80052 kB
VmPTE:	     568 kB
VmPMD:	      92 kB
VmSwap:	       0 kB
HugetlbPages:	       0 kB
Threads:	1
SigQ:	0/7760
SigPnd:	0000000000000000
ShdPnd:	0000000000000000
SigBlk:	0000000000010000
SigIgn:	0000000000001000
SigCgt:	0000000188014003
CapInh:	00000000a80c25fb
CapPrm:	00000000a80c25fb
CapEff:	00000000a80c25fb
CapBnd:	00000000a80c25fb
CapAmb:	0000000000000000
Seccomp:	2
Cpus_allowed:	f
Cpus_allowed_list:	0-3
Mems_allowed:	1
Mems_allowed_list:	0
voluntary_ctxt_switches:	67453
nonvoluntary_ctxt_switches:	37
```

```
root@f321544af567:/electron-hang# strace -ffp 46
Process 46 attached with 6 threads
[pid    51] futex(0x2e1e2f8, FUTEX_WAIT_PRIVATE, 0, NULL <unfinished ...>
[pid    49] futex(0x2e1e2f8, FUTEX_WAIT_PRIVATE, 0, NULL <unfinished ...>
[pid    46] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    50] futex(0x2e1e2f8, FUTEX_WAIT_PRIVATE, 0, NULL <unfinished ...>
[pid    48] futex(0x2e1e2f8, FUTEX_WAIT_PRIVATE, 0, NULL <unfinished ...>
[pid    47] futex(0x1e43220, FUTEX_WAIT_PRIVATE, 0, NULL <unfinished ...>
[pid    46] <... clock_gettime resumed> {2006, 767391118}) = 0
[pid    46] epoll_wait(5, ^CProcess 46 detached
 <detached ...>
Process 47 detached
Process 48 detached
Process 49 detached
Process 50 detached
Process 51 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 52
Process 52 attached with 24 threads
[pid    77] futex(0x1af4c44ab7b4, FUTEX_WAIT_PRIVATE, 15, NULL <unfinished ...>
[pid    75] futex(0x1af4c446ddd0, FUTEX_WAIT_PRIVATE, 0, NULL <unfinished ...>
[pid    74] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    73] futex(0x1af4c46b10b4, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    72] futex(0x7f7da12db91c, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    70] futex(0x7f7da22dd5bc, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    59] read(40,  <unfinished ...>
[pid    71] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    66] futex(0x7f7da42e15bc, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    68] futex(0x7f7da32df5bc, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    67] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    71] <... clock_gettime resumed> {2013, 581049979}) = 0
[pid    71] epoll_wait(53,  <unfinished ...>
[pid    69] futex(0x7f7da2ade5bc, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    67] <... clock_gettime resumed> {2013, 581070554}) = 0
[pid    65] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    64] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    63] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    62] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    61] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    67] epoll_wait(58,  <unfinished ...>
[pid    60] select(43, [42], NULL, NULL, NULL <unfinished ...>
[pid    61] <... clock_gettime resumed> {2013, 581410847}) = 0
[pid    61] epoll_wait(43,  <unfinished ...>
[pid    58] clock_gettime(CLOCK_MONOTONIC, {2013, 581566361}) = 0
[pid    58] epoll_wait(44,  <unfinished ...>
[pid    57] clock_gettime(CLOCK_MONOTONIC, {2013, 581661147}) = 0
[pid    57] epoll_wait(34,  <unfinished ...>
[pid    55] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    56] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    55] <... restart_syscall resumed> ) = -1 EAGAIN (Resource temporarily unavailable)
[pid    55] futex(0x1af4c447dac4, FUTEX_WAIT_BITSET_PRIVATE, 56, {2234, 444419534}, ffffffff <unfinished ...>
[pid    53] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    52] read(76, ^CProcess 52 detached
 <detached ...>
Process 53 detached
Process 55 detached
Process 56 detached
Process 57 detached
Process 58 detached
Process 59 detached
Process 60 detached
Process 61 detached
Process 62 detached
Process 63 detached
Process 64 detached
Process 65 detached
Process 66 detached
Process 67 detached
Process 68 detached
Process 69 detached
Process 70 detached
Process 71 detached
Process 72 detached
Process 73 detached
Process 74 detached
Process 75 detached
Process 77 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 54
Process 54 attached
ppoll([{fd=3, events=POLLIN}], 1, NULL, [], 8^CProcess 54 detached
 <detached ...>
 ```

 ```
root@f321544af567:/electron-hang# strace -ffp 76
Process 76 attached with 8 threads
[pid    92] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    94] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    93] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    76] restart_syscall(<... resuming interrupted call ...> <unfinished ...>
[pid    94] <... clock_gettime resumed> {2054, 12817855}) = 0
[pid    93] <... clock_gettime resumed> {2054, 12841726}) = 0
[pid    86] futex(0x35d27df57d04, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    94] epoll_wait(18,  <unfinished ...>
[pid    93] epoll_wait(13,  <unfinished ...>
[pid    83] futex(0x35d27df578e4, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    85] futex(0x35d27df57ba4, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    84] futex(0x35d27df57a44, FUTEX_WAIT_PRIVATE, 1, NULL <unfinished ...>
[pid    92] <... restart_syscall resumed> ) = -1 ETIMEDOUT (Connection timed out)
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492075943}) = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492181217}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492213978}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492247438}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492303471}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492358305}) = 0
[pid    92] gettid()                    = 92
[pid    92] gettimeofday({1494816766, 748088}, {0, 1494816766}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492499237}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492562561}) = 0
[pid    92] write(8, "!", 1)            = 1
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492684515}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492744942}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492817755}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492903253}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 492976365}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 493022011}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 493077844}) = 0
[pid    92] futex(0x7fbb15bd792c, FUTEX_WAIT_BITSET_PRIVATE, 1, {2059, 492305844}, ffffffff <unfinished ...>
[pid    76] <... restart_syscall resumed> ) = 1
[pid    76] recvmsg(9, 0x7ffeaa4190e0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] read(7, "!", 2)             = 1
[pid    76] clock_gettime(CLOCK_MONOTONIC, {2054, 493296882}) = 0
[pid    76] futex(0x7fbb15bd792c, FUTEX_CMP_REQUEUE_PRIVATE, 1, 2147483647, 0x7fbb15bd7900, 2 <unfinished ...>
[pid    92] <... futex resumed> )       = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAIT_PRIVATE, 2, NULL <unfinished ...>
[pid    76] <... futex resumed> )       = 1
[pid    76] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1 <unfinished ...>
[pid    92] <... futex resumed> )       = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 493800679}) = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] futex(0x35d27ded2198, FUTEX_WAIT_PRIVATE, 2, NULL <unfinished ...>
[pid    76] <... futex resumed> )       = 1
[pid    76] futex(0x35d27ded2198, FUTEX_WAKE_PRIVATE, 1 <unfinished ...>
[pid    92] <... futex resumed> )       = 0
[pid    92] futex(0x35d27ded2198, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494216281}) = 0
[pid    92] gettid()                    = 92
[pid    92] gettimeofday({1494816766, 750033}, {0, 1494816766}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494490653}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494551480}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494680825}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494785300}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494863507}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 494961190}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2054, 495066664}) = 0
[pid    92] futex(0x7fbb15bd792c, FUTEX_WAIT_BITSET_PRIVATE, 1, {2059, 492355664}, ffffffff <unfinished ...>
[pid    76] <... futex resumed> )       = 1
[pid    76] clock_gettime(CLOCK_MONOTONIC, {2054, 495214986}) = 0
[pid    76] clock_gettime(CLOCK_MONOTONIC, {2054, 495283504}) = 0
[pid    76] recvmsg(9, 0x7ffeaa4190b0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] poll([{fd=6, events=POLLIN}, {fd=9, events=POLLIN}, {fd=7, events=POLLIN}], 3, 0) = 0 (Timeout)
[pid    76] recvmsg(9, 0x7ffeaa4190e0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] recvmsg(9, 0x7ffeaa4190b0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] poll([{fd=6, events=POLLIN}, {fd=9, events=POLLIN}, {fd=7, events=POLLIN}], 3, 0) = 0 (Timeout)
[pid    76] recvmsg(9, 0x7ffeaa4190e0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] recvmsg(9, 0x7ffeaa4190b0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] poll([{fd=6, events=POLLIN}, {fd=9, events=POLLIN}, {fd=7, events=POLLIN}], 3, 4294967295 <unfinished ...>
[pid    92] <... futex resumed> )       = -1 ETIMEDOUT (Connection timed out)
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493274240}) = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493386106}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493442139}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493479894}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493529235}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493566490}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 493603546}) = 0
[pid    92] futex(0x7fbb15bd792c, FUTEX_WAIT_BITSET_PRIVATE, 1, {2059, 494527546}, ffffffff) = -1 ETIMEDOUT (Connection timed out)
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 494877721}) = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 494968612}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495041525}) = 0
[pid    92] gettid()                    = 92
[pid    92] gettimeofday({1494816771, 750764}, {0, 1494816771}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495152592}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495227402}) = 0
[pid    92] write(8, "!", 1)            = 1
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495340667}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495400395}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495453332}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495497379}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495523148}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495575386}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 495653193}) = 0
[pid    92] futex(0x7fbb15bd792c, FUTEX_WAIT_BITSET_PRIVATE, 1, {2064, 492762193}, ffffffff <unfinished ...>
[pid    76] <... poll resumed> )        = 1 ([{fd=7, revents=POLLIN}])
[pid    76] recvmsg(9, 0x7ffeaa4190e0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] read(7, "!", 2)             = 1
[pid    76] clock_gettime(CLOCK_MONOTONIC, {2059, 495968515}) = 0
[pid    76] futex(0x7fbb15bd792c, FUTEX_CMP_REQUEUE_PRIVATE, 1, 2147483647, 0x7fbb15bd7900, 2 <unfinished ...>
[pid    92] <... futex resumed> )       = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAIT_PRIVATE, 2, NULL <unfinished ...>
[pid    76] <... futex resumed> )       = 1
[pid    76] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1 <unfinished ...>
[pid    92] <... futex resumed> )       = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 496256770}) = 0
[pid    92] futex(0x7fbb15bd7900, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] futex(0x35d27ded2198, FUTEX_WAIT_PRIVATE, 2, NULL <unfinished ...>
[pid    76] <... futex resumed> )       = 1
[pid    76] futex(0x35d27ded2198, FUTEX_WAKE_PRIVATE, 1 <unfinished ...>
[pid    92] <... futex resumed> )       = 0
[pid    92] futex(0x35d27ded2198, FUTEX_WAKE_PRIVATE, 1) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 496642808}) = 0
[pid    92] gettid()                    = 92
[pid    92] gettimeofday({1494816771, 752383}, {0, 1494816771}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 496839173}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 496893908}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 496927667}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 496959429}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 497026649}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 497170277}) = 0
[pid    92] clock_gettime(CLOCK_MONOTONIC, {2059, 497224712}) = 0
[pid    92] futex(0x7fbb15bd792c, FUTEX_WAIT_BITSET_PRIVATE, 1, {2064, 492738712}, ffffffff <unfinished ...>
[pid    76] <... futex resumed> )       = 1
[pid    76] clock_gettime(CLOCK_MONOTONIC, {2059, 497370737}) = 0
[pid    76] clock_gettime(CLOCK_MONOTONIC, {2059, 497416183}) = 0
[pid    76] recvmsg(9, 0x7ffeaa4190b0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] poll([{fd=6, events=POLLIN}, {fd=9, events=POLLIN}, {fd=7, events=POLLIN}], 3, 0) = 0 (Timeout)
[pid    76] recvmsg(9, 0x7ffeaa4190e0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] recvmsg(9, 0x7ffeaa4190b0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] poll([{fd=6, events=POLLIN}, {fd=9, events=POLLIN}, {fd=7, events=POLLIN}], 3, 0) = 0 (Timeout)
[pid    76] recvmsg(9, 0x7ffeaa4190e0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] recvmsg(9, 0x7ffeaa4190b0, 0) = -1 EAGAIN (Resource temporarily unavailable)
[pid    76] poll([{fd=6, events=POLLIN}, {fd=9, events=POLLIN}, {fd=7, events=POLLIN}], 3, 4294967295^CProcess 76 detached
 <detached ...>
Process 83 detached
Process 84 detached
Process 85 detached
Process 86 detached
Process 92 detached
Process 93 detached
Process 94 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 80
Process 80 attached with 3 threads
[pid    82] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    81] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    80] recvmsg(18,  <unfinished ...>
[pid    82] <... clock_gettime resumed> {2092, 203392158}) = 0
[pid    81] <... clock_gettime resumed> {2092, 203400448}) = 0
[pid    82] epoll_wait(26,  <unfinished ...>
[pid    81] epoll_wait(31, ^CProcess 80 detached
Process 81 detached
 <detached ...>
Process 82 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 88
Process 88 attached with 3 threads
[pid    90] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    89] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    90] <... clock_gettime resumed> {2104, 59456146}) = 0
[pid    89] <... clock_gettime resumed> {2104, 59480617}) = 0
[pid    90] epoll_wait(26,  <unfinished ...>
[pid    89] epoll_wait(31,  <unfinished ...>
[pid    88] recvmsg(18, ^CProcess 88 detached
 <detached ...>
Process 89 detached
Process 90 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 95
Process 95 attached with 3 threads
[pid    95] recvmsg(18,  <unfinished ...>
[pid    97] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    96] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    97] <... clock_gettime resumed> {2108, 970433436}) = 0
[pid    96] <... clock_gettime resumed> {2108, 970411062}) = 0
[pid    97] epoll_wait(31,  <unfinished ...>
[pid    96] epoll_wait(26, ^CProcess 95 detached
Process 96 detached
 <detached ...>
Process 97 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 99
Process 99 attached with 3 threads
[pid   101] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid    99] recvmsg(18,  <unfinished ...>
[pid   101] <... clock_gettime resumed> {2113, 737713630}) = 0
[pid   100] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid   101] epoll_wait(31,  <unfinished ...>
[pid   100] <... clock_gettime resumed> {2113, 737840977}) = 0
[pid   100] epoll_wait(26, ^CProcess 99 detached
Process 100 detached
 <detached ...>
Process 101 detached
```

```
root@f321544af567:/electron-hang# strace -ffp 103
Process 103 attached with 3 threads
[pid   105] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid   104] clock_gettime(CLOCK_MONOTONIC,  <unfinished ...>
[pid   103] recvmsg(18,  <unfinished ...>
[pid   105] <... clock_gettime resumed> {2127, 648787174}) = 0
[pid   104] <... clock_gettime resumed> {2127, 648768397}) = 0
[pid   105] epoll_wait(31,  <unfinished ...>
[pid   104] epoll_wait(26, ^CProcess 103 detached
Process 104 detached
 <detached ...>
Process 105 detached
```
