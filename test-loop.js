const fetchPrice = async () => {
  const res = await fetch('https://www.google.com/finance/quote/EUR-USD');
  const html = await res.text();
  const match = html.match(/class="YMlKec fxKbKc">([^<]+)<\/div>/);
  console.log('[' + new Date().toLocaleTimeString() + '] Price:', match ? match[1] : 'Not found');
};

const run = async () => {
  for (let i = 0; i < 5; i++) {
    await fetchPrice();
    await new Promise(r => setTimeout(r, 10000));
  }
};
run();
