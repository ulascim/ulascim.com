# Gambler's Fallacy: "It's due to go up after 3 red candles!"

cash, position, FEE = 10000, 0, 0.001
red_streak = 0
green_streak = 0

for open_price, close in data:  # data = [(open, close), ...]
    
    if close < open_price:  # RED candle
        red_streak += 1
        green_streak = 0
    else:  # GREEN candle
        green_streak += 1
        red_streak = 0
    
    if red_streak >= 3:  # 3 reds in a row = "must go up now!"
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    elif green_streak >= 3:  # 3 greens = "must go down now!"
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0

final = cash + position * data[-1][1]
