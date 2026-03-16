declare module 'react-hook-form' {
  export interface UseFormMethods<TFieldValues extends Record<string, unknown> = Record<string, unknown>> {
    register: (refOrRules?: unknown) => (ref: unknown) => void;
    unregister: (name: string | string[]) => void;
    errors: Record<string, { message?: string; type?: string }>;
    watch: (names?: string | string[]) => unknown;
    setValue: (name: string, value: unknown, config?: { shouldValidate?: boolean }) => void;
    getValues: (names?: string | string[]) => TFieldValues;
    triggerValidation: (names?: string | string[]) => Promise<boolean>;
    reset: (values?: TFieldValues) => void;
    clearError: (name?: string | string[]) => void;
    setError: (name: string, error: { type: string; message?: string }) => void;
    formState: {
      isDirty: boolean;
      dirtyFields: Set<string>;
      isSubmitted: boolean;
      submitCount: number;
      touched: Record<string, boolean>;
      isSubmitting: boolean;
      isValid: boolean;
    };
  }

  export interface UseFormOptions<TFieldValues extends Record<string, unknown> = Record<string, unknown>> {
    mode?: 'onSubmit' | 'onBlur' | 'onChange';
    reValidateMode?: 'onSubmit' | 'onBlur' | 'onChange';
    defaultValues?: TFieldValues;
    validationSchema?: unknown;
    submitFocusError?: boolean;
    validateCriteriaMode?: 'firstError' | 'all';
  }

  export function useForm<TFieldValues extends Record<string, unknown> = Record<string, unknown>>(
    options?: UseFormOptions<TFieldValues>
  ): UseFormMethods<TFieldValues>;

  export type ControllerProps<T> = {
    name: string;
    control?: unknown;
    defaultValue?: unknown;
    rules?: Record<string, unknown>;
    render: (props: { onChange: (value: unknown) => void; onBlur: () => void; value: unknown }) => React.ReactNode;
  };

  export function Controller<T>(props: ControllerProps<T>): React.ReactElement;
}