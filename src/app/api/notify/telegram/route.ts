import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { chatId, message } = await request.json();

    if (!chatId || !message) {
      return NextResponse.json({ success: false, error: 'Missing chatId or message' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn('TELEGRAM_BOT_TOKEN is not set in environment variables');
      return NextResponse.json({ 
        success: false, 
        error: 'Telegram Bot Token not configured on server' 
      }, { status: 503 });
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telegram API Error:', data);
      return NextResponse.json({ success: false, error: data.description || 'Failed to send message' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Telegram Notify Route Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
