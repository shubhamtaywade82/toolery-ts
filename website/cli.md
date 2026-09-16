# CLI reference

## Run

```bash
toolery run --model MODEL --adapter mock --tier easy --trials 1
toolery run --model MODEL --adapter openai-compatible --base-url http://localhost:11434/v1 --tier all --trials 3
```

Options include `--model`, `--adapter`, `--source`, `--tier`, `--trials`, `--base-url`, `--profile`, `--category`, `--cluster`, `--concurrency`, `--timeout`, `--output`, `--resume` and `--with-perf`.

## Probe

```bash
toolery probe --base-url http://localhost:11434/v1
```

## Scenarios

```bash
toolery scenarios --tier very-hard
```

## Profiles

```bash
toolery profiles
```

## Export

```bash
toolery export --input results.json --output results.csv
```
