cash, position, FEE = 10000, 0, 0.001

# Fibonacci numbers (candle indices where we trade)
fibs = set()
a, b = 1, 1
while a < 1000000:
    fibs.add(a)
    a, b = b, a + b

buy_turn = True  # alternate buy/sell on fib numbers

for i, close in enumerate(prices):
    if (i + 1) in fibs:  # candle number is fibonacci!
        if buy_turn:
            if cash > 0:
                position = cash * (1 - FEE) / close
                cash = 0
        else:
            if position > 0:
                cash = position * close * (1 - FEE)
                position = 0
        buy_turn = not buy_turn

final = cash + position * prices[-1]
