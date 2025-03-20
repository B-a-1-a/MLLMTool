import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    // Fetch data from the `audio_files` table
    const { data, error } = await supabase
      .from("audio_files") // Correct table name
      .select("*")
      .limit(5);

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}