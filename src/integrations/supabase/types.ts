export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      extra_earnings: {
        Row: {
          amount: number
          created_at: string
          description: string
          earned_at: string | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          earned_at?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          earned_at?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      future_jobs: {
        Row: {
          agreed_amount: number
          client: string
          collected_amount: number | null
          collected_at: string | null
          converted_invoice_id: string | null
          converted_to_invoice: boolean
          created_at: string
          description: string
          expected_payment_date: string | null
          id: string
          is_recurring: boolean
          notes: string | null
          offer_pdf_name: string | null
          offer_pdf_path: string | null
          recurring_monthly_amount: number | null
          recurring_start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agreed_amount?: number
          client?: string
          collected_amount?: number | null
          collected_at?: string | null
          converted_invoice_id?: string | null
          converted_to_invoice?: boolean
          created_at?: string
          description?: string
          expected_payment_date?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          offer_pdf_name?: string | null
          offer_pdf_path?: string | null
          recurring_monthly_amount?: number | null
          recurring_start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agreed_amount?: number
          client?: string
          collected_amount?: number | null
          collected_at?: string | null
          converted_invoice_id?: string | null
          converted_to_invoice?: boolean
          created_at?: string
          description?: string
          expected_payment_date?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          offer_pdf_name?: string | null
          offer_pdf_path?: string | null
          recurring_monthly_amount?: number | null
          recurring_start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          debtor: string
          extracted_text: string | null
          gross_total: number
          id: string
          invoice_date: string | null
          invoice_number: number
          pdf_file_name: string | null
          pdf_storage_path: string | null
          pension_fund: number
          stamp_duty: number
          taxable_amount: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          debtor: string
          extracted_text?: string | null
          gross_total?: number
          id?: string
          invoice_date?: string | null
          invoice_number: number
          pdf_file_name?: string | null
          pdf_storage_path?: string | null
          pension_fund?: number
          stamp_duty?: number
          taxable_amount?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          debtor?: string
          extracted_text?: string | null
          gross_total?: number
          id?: string
          invoice_date?: string | null
          invoice_number?: number
          pdf_file_name?: string | null
          pdf_storage_path?: string | null
          pension_fund?: number
          stamp_duty?: number
          taxable_amount?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          frequency: string
          id: string
          name: string
          next_due_date: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          next_due_date?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          next_due_date?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_deductions: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          id: string
          notes: string | null
          paid_at: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      tax_payments: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          reference: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
