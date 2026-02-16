import random

cash, position, FEE = 10000, 0, 0.001
bias = 0.5  # starts neutral

for close in prices:
    # Drunk sailor staggers: bias randomly shifts
    bias += random.uniform(-0.1, 0.1)
    bias = max(0.1, min(0.9, bias))  # keep between 0.1 and 0.9
    
    if random.random() < bias:  # biased coin flip
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    else:
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0

final = cash + position * prices[-1]
