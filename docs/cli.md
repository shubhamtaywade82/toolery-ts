# CLI reference

## Run

```bash
toolery run --model MODEL --adapter mock --tier easy --trials 1
toolery run --model MODEL --base-url http://localhost:11434/v1 --adapter openai-compatible --tier all --trials 3
```

Important options include `--model`, `--adapter`, `--tier`, `--trials`, `--base-url`, `--profile`, `--concurrency`, `--output`, `--resume`, `--category`, `--source`, and `--with-perf`.

## Probe

```bash
toolery probe --base-url http://localhost:11434/v1
```

Checks endpoint reachability and available models without running the benchmark.

## Scenarios

```bash
toolery scenarios --tier very-hard
```

Lists scenarios from the selected source pack.

## Profiles

```bash
toolery profiles
```

Lists reporting profiles and their capability weights.

## Export

```bash
toolery export --input results.json --output results.csv
```
